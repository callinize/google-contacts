/*jslint indent:2*/
/*global require: true, console: true */
var GoogleContacts = require('../').GoogleContacts;
var assert = require('assert');
var contactsTested = false,
    contactTested = false,
    contactCreated = false,
    contactUpdated = false;

console.log('Test running with Google contact Id: %s and token: %s ',
    process.env.GOOGLE_CONTACT_ID || 'NONE', process.env.GOOGLE_TOKEN || 'NONE');

var c = new GoogleContacts({
  token: process.env.GOOGLE_TOKEN
});

c.getContacts(function (err, contacts) {
  if (err) throw err;
  assert.ok(typeof contacts === 'object', 'Contacts is not an object');
  contactsTested = true;
});

c.getContact(function (err, contact) {
  if (err) throw err;
  assert.ok(typeof contact === 'object', 'Contact is not an object');
  contactTested = true;
}, {entry: {id: process.env.GOOGLE_CONTACT_ID}});

var contact = {
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

c.createContact(function (err, createdContact) {
  if (err) throw err;
  assert.ok(typeof createdContact === 'object', 'Contact is not an object');
  contactCreated = true;
}, contact);

contact.entry.id = process.env.GOOGLE_CONTACT_ID;
c.updateContact(function (err, updatedContact) {
  if (err) throw err;
  assert.ok(typeof updatedContact === 'object', 'Contact is not an object');
  contactUpdated   = true;
}, contact);

process.on('exit', function () {
  if (!contactsTested || !contactTested || !contactCreated || !contactUpdated) {
    throw new Error('contact test failed');
  }

  console.log("all tests passed");
});
