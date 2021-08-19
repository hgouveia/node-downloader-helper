/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { URL } = require('url');
const { existsSync } = require('fs');

// Console colors
module.exports.COLOR_NC = '\x1b[0m'; // No Color \e
module.exports.COLOR_RED = '\x1b[0;31m';
module.exports.COLOR_GREEN = '\x1b[0;32m';
module.exports.COLOR_YELLOW = '\x1b[0;33m';
module.exports.COLOR_BLUE = '\x1b[0;34m';
module.exports.COLOR_MAGENTA = '\x1b[0;35m';
module.exports.COLOR_CYAN = '\x1b[0;36m';

// https://gist.github.com/thomseddon/3511330
module.exports.byteHelper = function (value) {
    if (value === 0) {
        return '0 b';
    }
    const units = ['b', 'kB', 'MB', 'GB', 'TB'];
    const number = Math.floor(Math.log(value) / Math.log(1024));
    return (value / Math.pow(1024, Math.floor(number))).toFixed(1) + ' ' +
        units[number];
};

module.exports.color = function (color, text) {
    return `${color}${text}${module.exports.COLOR_NC}`;
};

module.exports.inlineLog = function (msg) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(msg);
};

module.exports.isValidUrl = function (url) {
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
}

module.exports.isValidPath = function (path) {
    try {
        return existsSync(path);
    } catch (_) {
        return false;
    }
};