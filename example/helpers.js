/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { DH_STATES } = require('../dist');

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