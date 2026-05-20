const crypto = require('crypto');
const secret = 'change_this_to_a_long_random_string_min_32_chars';
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const payload = Buffer.from(JSON.stringify({ sub: 'test-user', email: 'dev@example.com' })).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const sig = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
console.log(header + '.' + payload + '.' + sig);
