/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { URL } = require('url');
const { existsSync } = require('fs');
const { DH_STATES } = require('../dist');

// Console colors
module.exports.COLOR_NC = '\033[0m'; // No Color \e
module.exports.COLOR_RED = '\033[0;31m';
module.exports.COLOR_GREEN = '\033[0;32m';
module.exports.COLOR_YELLOW = '\033[0;33m';
module.exports.COLOR_BLUE = '\033[0;34m';
module.exports.COLOR_MAGENTA = '\033[0;35m';
module.exports.COLOR_CYAN = '\033[0;36m';

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

module.exports.pauseResumeTimer = function (_dl, wait) {
    setTimeout(() => {
        if (_dl.state === DH_STATES.FINISHED ||
            _dl.state === DH_STATES.FAILED) {
            return;
        }

        _dl.pause()
            .then(() => console.log(`Paused for ${wait / 1000} seconds`))
            .then(() => setTimeout(() => _dl.resume(), wait));

    }, wait);
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