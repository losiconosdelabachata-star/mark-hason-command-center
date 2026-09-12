'use strict';

const meta = require('./meta');
const google = require('./google');
const reddit = require('./reddit');
const pinterest = require('./pinterest');
const tiktok = require('./tiktok');
const twitter = require('./twitter');
const linkedin = require('./linkedin');
const snapchat = require('./snapchat');
const twitch = require('./twitch');
const kick = require('./kick');

const ALL = [meta, google, reddit, pinterest, tiktok, twitter, linkedin, snapchat, twitch, kick];

const BY_ID = Object.fromEntries(ALL.map((p) => [p.id, p]));

function get(id) {
  return BY_ID[id] || null;
}

module.exports = { all: ALL, get };
