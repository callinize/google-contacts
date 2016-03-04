/**
 * @todo: recursively send requests until all contacts are fetched
 *
 * @see https://developers.google.com/google-apps/contacts/v3/reference#ContactsFeed
 *
 * To API test requests:
 *
 * @see https://developers.google.com/oauthplayground/
 *
 * To format JSON nicely:
 *
 * @see http://jsonviewer.stack.hu/
 *
 * Note: The Contacts API has a hard limit to the number of results it can return at a
 * time even if you explicitly request all possible results. If the requested feed has
 * more fields than can be returned in a single response, the API truncates the feed and adds
 * a "Next" link that allows you to request the rest of the response.
 */
var EventEmitter = require('events').EventEmitter,
    _ = require('lodash'),
    qs = require('querystring'),
    util = require('util'),
    url = require('url'),
    https = require('https'),
    debug = require('debug')('google-contacts'),
    xml2js = require('xml2js');

var GoogleContacts = function (params) {
    if (typeof params === 'string') {
        params = {token: params}
    }
    if (!params) {
        params = {};
    }

    this.contacts = [];
    this.consumerKey = params.consumerKey ? params.consumerKey : null;
    this.consumerSecret = params.consumerSecret ? params.consumerSecret : null;
    this.token = params.token ? params.token : null;
    this.refreshToken = params.refreshToken ? params.refreshToken : null;

    this.params = _.defaults(params, {thin: true});
};

GoogleContacts.prototype = {};

util.inherits(GoogleContacts, EventEmitter);

GoogleContacts.prototype._request = function (params, cb) {
    if (typeof params === 'function') {
        cb = params;
        params = {};
    }

    params.method = params.method || 'GET';

    var isGet = params.method === 'GET';

    var opts = {
        host: 'www.google.com',
        port: 443,
        path: this._buildPath(params),
        method: params.method || 'GET',
        headers: {
            'Authorization': 'OAuth ' + this.token,
            'GData-Version': 3
        }
    };

    if(!isGet){
        opts.headers['content-type'] = 'application/atom+xml';
    }

    if(params.method === 'PUT'){
        opts.headers['If-Match'] = '*';
    }

    debug(req);

    var req = https.request(opts, function (res) {
            var data = '';

            res.on('data', function (chunk) {
                debug('got ' + chunk.length + ' bytes');
                data += chunk.toString('utf-8');
            });

            res.on('error', function (err) {
                cb(err);
            });

            res.on('end', function () {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    var error = new Error('Bad client request status: ' + res.statusCode);
                    return cb(error);
                }
                try {
                    debug(data);
                    if(isGet) parseJSON(data, cb);
                    else parseXML(data, cb);
                }
                catch (err) {
                    cb(err);
                }
            });
        })

    if(!isGet){
        req.write(params.body);
    }

    req.end();

    function parseXML(data, cb){
        var parser = new xml2js.Parser();
        parser.parseString(data, function(err, json){
            if(err) return cb(err);

            cb(null, json);
        });
    }

    function parseJSON(data, cb){
        cb(null, JSON.parse(data));
    }
};

GoogleContacts.prototype.getContacts = function (cb, params) {
    var self = this;

    this._request(_.extend({type: 'contacts', method: 'GET'}, params, this.params), receivedContacts);

    function receivedContacts(err, data) {
        if (err) return cb(err);

        var feed = _.get(data, 'feed', []);
        var entry = _.get(data, 'feed.entry', []);
        if (!entry.length) {
            return cb(null, entry);
        }

        self._saveContactsFromFeed(feed);

        var next = false;
        _.each(feed.link, function (link) {
            if (link.rel === 'next') {
                next = true;
                var path = url.parse(link.href).path;
                self._request({path: path}, receivedContacts);
            }
        });
        if (!next) {
            cb(null, self.contacts);
        }
    }
};

GoogleContacts.prototype.getContact = function (cb, params) {
    var self = this;

    if(!_.has(params, 'entry.id')){
        return cb("No id found in params.entry");
    }

    this._request(_.extend({type: 'contacts', method: 'GET'}, this.params, params), receivedContact);

    function receivedContact(err, contact) {
        if (err) return cb(err);

        cb(null, contact);
    }

};

/**
 * Receives an object with @layout and create the contact.
 * Unfortunately google apps do not support contact payload in json
 * format, so we have to convert the object to xml.
 *
 * @see https://developers.google.com/google-apps/contacts/v3/#creating_contacts
 *
 * Object layout: Fot convinience we handle the xml -> js conversion adding the
 * required xml namespaces, so the json object can have a simplified layout (see params).
 *
 * @param cb: callback
 * @param params: must contain 'entry' variable with the following format:
 * {
 *   name: {
 *       fullName: 'full contact name'
 *   },
 *   email:[{
 *           primary: true|false,
 *           address: 'email@address.com',
 *           type: 'home|work'
 *       }],
 *   phoneNumber:[{
 *           type: 'home|work|mobile|main|work_fax|home_fax|pager',
 *           phoneNumber: 'phone number'
 *       }]
 * }
 * */
GoogleContacts.prototype.createContact = function (cb, params) {
    var self = this;

    if(!_.has(params, 'entry.name')){
        return cb("No name found in params");
    }

    var gContact = self._getGoogleContactObject(params.entry);

    var builder = new xml2js.Builder({rootName:'entry'});
    params.body = builder.buildObject(gContact);

    this._request(_.extend({type: 'contacts', method: 'POST'}, this.params, params), receivedContact);

    function receivedContact(err, contact) {
        if (err) return cb(err);

        cb(null, contact);
    }
};

/**
 * Receives an object with @layout and create the contact.
 * Unfortunately google apps do not support contact payload in json
 * format, so we have to convert the object to xml.
 *
 * @see https://developers.google.com/google-apps/contacts/v3/#updating_contacts
 *
 * Object layout: Fot convinience we handle the xml -> js conversion adding the
 * required xml namespaces, so the json object can have a simplified layout (see params).
 *
 * @param cb: callback
 * @param params: must contain 'entry' variable with the following format:
 * {
 *   id: 'contact Id',
 *   name: {
 *       fullName: 'full contact name'
 *   },
 *   email:[{
 *           primary: true|false,
 *           address: 'email@address.com',
 *           type: 'home|work'
 *       }],
 *   phoneNumber:[{
 *           type: 'home|work|mobile|main|work_fax|home_fax|pager',
 *           phoneNumber: 'phone number'
 *       }]
 * }
 *
 * The only required property in entry is id, all the other ones are optional.
 * */
GoogleContacts.prototype.updateContact = function (cb, params) {
    var self = this;

    if(!_.has(params, 'entry.id')){
        return cb("No id found in params.entry");
    }

    var gContact = self._getGoogleContactObject(params.entry);

    var builder = new xml2js.Builder({rootName:'entry'});
    params.body = builder.buildObject(gContact);

    this._request(_.extend({type: 'contacts', method: 'PUT'}, this.params, params), receivedContact);

    function receivedContact(err, contact) {
        if (err) return cb(err);

        cb(null, contact);
    }
};

GoogleContacts.prototype._saveContactsFromFeed = function (feed) {
    var self = this;
    _.each(feed.entry, function (entry) {
        var el, url;
        if (self.params.thin) {
            url = _.get(entry, 'id.$t', '');
            el = {
                name: _.get(entry, 'title.$t'),
                email: _.get(entry, 'gd$email.0.address'), // only save first email
                phoneNumber: _.get(entry, 'gd$phoneNumber.0.uri', '').replace('tel:', ''),
                id: url.substring(_.lastIndexOf(url, '/') + 1)
            };
        } else {
            el = entry;
        }
        self.contacts.push(el);
    });
};

GoogleContacts.prototype._buildPath = function (params) {
    if (params.path) return params.path;

    params = _.extend({}, params, this.params);
    params.type = params.type || 'contacts';
    params.alt = params.alt || 'json';
    params.projection = params.projection || (params.thin ? 'thin' : 'full');
    params.email = params.email || 'default';
    params['max-results'] = params['max-results'] || 10000;

    var query = {
        alt: params.alt
    };

    if(!_.has(params, 'entry.id')) query['max-results'] = params['max-results'];

    if (params['updated-min'])
        query['updated-min'] = params['updated-min'];

    if (params.q || params.query)
        query.q = params.q || params.query;

    var path = '/m8/feeds/';
    path += params.type + '/';
    path += params.email + '/';
    path += params.projection;
    if(_.has(params, 'entry.id')) path +=  '/'+ params.entry.id;
    if (params.method === "GET") path += '?' + qs.stringify(query);

    return path;
};

GoogleContacts.prototype.refreshAccessToken = function (refreshToken, params, cb) {
    if (typeof params === 'function') {
        cb = params;
        params = {};
    }

    var data = {
        refresh_token: refreshToken,
        client_id: this.consumerKey,
        client_secret: this.consumerSecret,
        grant_type: 'refresh_token'

    };

    var body = qs.stringify(data);

    var opts = {
        host: 'accounts.google.com',
        port: 443,
        path: '/o/oauth2/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
        }
    };

    var req = https.request(opts, function (res) {
        var data = '';
        res.on('end', function () {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                var error = new Error('Bad client request status: ' + res.statusCode);
                return cb(error);
            }
            try {
                data = JSON.parse(data);
                cb(null, data.access_token);
            }
            catch (err) {
                cb(err);
            }
        });

        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('error', cb);

    }).on('error', cb);

    req.write(body);
    req.end();
};

GoogleContacts.prototype._getGoogleContactObject = function(params){
    var prefix = params.prefix || 'gd:';
    var root = {
        $: {
            'xmlns': _getSchema('xmlns'),
            'xmlns:gd': _getSchema('gd'),
            'xmlns:gContact': _getSchema('gContact')
        },
        category: {
            $: {
                'scheme' : _getSchema('scheme'),
                'term' : _getSchema('term')
            }
        }
    };

    if(_.has(params, 'name')) {
        root.name = {
            $: {xmlns: _getSchema('gd')}
        }
    }

    if(_.has(params, 'name.fullName')) root.name.fullName = _.get(params, 'name.fullName');
    if(_.has(params, 'name.givenName')) root.name.givenName = _.get(params, 'name.givenName');
    if(_.has(params, 'name.familyName')) root.name.familyName = _.get(params, 'name.familyName');
    if(_.has(params, 'content')) root.content = _.get(params, 'content');
    if(_.has(params, 'title')) root.title = _.get(params, 'title');

    if(_.has(params, 'email')){
        root.email = [];
        if(!_.isArray(params.email)) params.email = [params.email];

        _.each(params.email, function(m){
            var newEmail = {
                $:{
                    address: _.get(m, 'address', '')
                }
            };

            if(_.has(m, 'primary')) newEmail.$.primary = _.get(m, 'primary');
            if(_.has(m, 'type')) newEmail.$.rel = _getSchema(_.get(m, 'type'), 'email');
            if(_.has(m, 'rel')) newEmail.$.rel = _.get(m, 'rel');

            root.email.push(newEmail);
        });
    }

    if(_.has(params, 'phoneNumber')){
        root.phoneNumber = [];
        if(!_.isArray(params.phoneNumber)) params.phoneNumber = [params.phoneNumber];

        _.each(params.phoneNumber, function(p){
            var newPhone = {
                _: _.get(p, 'phoneNumber', ''),
                $: {}
            };

            if(_.has(p, 'primary')) newPhone.$.label = _.get(p, 'label');
            if(_.has(p, 'label')) newPhone.$.label = _.get(p, 'label');
            if(_.has(p, 'type')) newPhone.$.rel = _getSchema(_.get(p, 'type'), 'phone');
            if(_.has(p, 'rel')) newPhone.$.rel = _.get(p, 'rel');

            root.phoneNumber.push(newPhone);
        });
    }

    return _addPrefix(root, prefix);

    function _getSchema(schemaName, rootSchema){
        if(rootSchema)
            schemaName = rootSchema + '.' + schemaName;

        var schemas = {
            'xmlns': "http://www.w3.org/2005/Atom",
            'gd': "http://schemas.google.com/g/2005",
            'gContact' : "xmlns:gContact='http://schemas.google.com/contact/2008'",
            'scheme': "http://schemas.google.com/g/2005#kind",
            'term': "http://schemas.google.com/contact/2008#contact",
            email:{
                'work': "http://schemas.google.com/g/2005#work",
                'home': "http://schemas.google.com/g/2005#home"
            },
            phone: {
                'work': "http://schemas.google.com/g/2005#work",
                'home': "http://schemas.google.com/g/2005#home",
                'main': "http://schemas.google.com/g/2005#main",
                'work_fax': "http://schemas.google.com/g/2005#work_fax",
                'home_fax': "http://schemas.google.com/g/2005#home_fax",
                'pager': "http://schemas.google.com/g/2005#pager"
            }
        };

        return _.get(schemas, schemaName, '');
    }

    function _addPrefix(obj, prefix){
        var prefixedObj = {};
        _.forOwn(obj, function(value, key){
            if(_.includes(['name', 'email', 'phoneNumber'], key))
                key = prefix + key;

            prefixedObj[key] = value;
        });

        return prefixedObj;
    }
}

exports.GoogleContacts = GoogleContacts;
