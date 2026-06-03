const path = require('path');
const crypto = require('crypto');

const normalizeSlug = (value, fallback = 'media') => {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || fallback;
};

const normalizeMediaFilename = (filename, fallback = 'media') => {
  const rawName = path.basename(String(filename || fallback).trim());
  const ext = path.extname(rawName).toLowerCase();
  const base = ext ? rawName.slice(0, -ext.length) : rawName;
  return `${normalizeSlug(base, fallback)}${ext}`;
};

const normalizePublicIdSegment = (value, fallback = 'media') => {
  const filename = normalizeMediaFilename(value, fallback);
  const ext = path.extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
};

const buildUploadPublicId = ({ prefix, userId, postId, index, originalname, timestamp = Date.now() }) => {
  const parts = [
    normalizeSlug(prefix, 'media'),
    postId ? normalizeSlug(postId, 'post') : null,
    userId ? normalizeSlug(userId, 'user') : null,
    timestamp,
    Number.isInteger(index) ? index : null,
    originalname ? normalizePublicIdSegment(originalname, 'upload') : null,
  ].filter((part) => part !== null && part !== undefined && part !== '');

  return parts.join('-');
};

const withCollisionSuffix = (publicId, source) => {
  const digest = crypto.createHash('sha1').update(String(source || publicId)).digest('hex').slice(0, 8);
  return `${publicId}-${digest}`;
};

module.exports = {
  normalizeSlug,
  normalizeMediaFilename,
  normalizePublicIdSegment,
  buildUploadPublicId,
  withCollisionSuffix,
};
