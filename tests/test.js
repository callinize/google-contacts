/*jslint indent:2*/
/*global require: true, console: true */
var GoogleContacts = require('../').GoogleContacts;
var assert = require('assert');
var contactsTested = false;
var contactTested = false;
var contactCreated = false;

var c = new GoogleContacts({
  token: process.env.GOOGLE_TOKEN
});

c.getContacts(function (err, contacts) {
  if (err) throw err;
  assert.ok(typeof contacts === 'object', 'Contacts is not an object');
  console.log(contacts);
  contactsTested = true;
});

c.getContact(function (err, contact) {
  if (err) throw err;
  assert.ok(typeof contact === 'object', 'Contact is not an object');
  console.log(contact);
  contactTested = true;
}, {id: process.env.GOOGLE_CONTACT_ID});

var contactToCreate = {
  entry: {
    name: {
      fullName: 'foo bar'
    },
    email: [{
      primary: true,
      address: 'foobar@foo.bar',
      type: 'home'
    }],
    phoneNumber: [{
      type: 'work',
      phoneNumber: '555555555'
    }]
  }
};

c.createContact(function (err, contact) {
  if (err) throw err;
  assert.ok(typeof contact === 'object', 'Contact is not an object');
  contactCreated = true;
}, contactToCreate);


process.on('exit', function () {
  if (!contactsTested || !contactTested || !contactCreated) {
    throw new Error('contact test failed');
  }
});
