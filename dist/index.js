'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.DownloaderHelper = exports.DH_STATES = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _fs = require('fs');

var fs = _interopRequireWildcard(_fs);

var _path = require('path');

var path = _interopRequireWildcard(_path);

var _http = require('http');

var http = _interopRequireWildcard(_http);

var _https = require('https');

var https = _interopRequireWildcard(_https);

var _url = require('url');

var URL = _interopRequireWildcard(_url);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DH_STATES = exports.DH_STATES = {
    IDLE: 'IDLE',
    STARTED: 'STARTED',
    DOWNLOADING: 'DOWNLOADING',
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    STOPPED: 'STOPPED',
    FINISHED: 'FINISHED',
    FAILED: 'FAILED'
};

var DownloaderHelper = exports.DownloaderHelper = function (_EventEmitter) {
    _inherits(DownloaderHelper, _EventEmitter);

    function DownloaderHelper(url, destFolder) {
        var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        _classCallCheck(this, DownloaderHelper);

        var _this = _possibleConstructorReturn(this, (DownloaderHelper.__proto__ || Object.getPrototypeOf(DownloaderHelper)).call(this));

        if (!_this.__validate(url, destFolder)) {
            return _possibleConstructorReturn(_this);
        }

        _this.url = url;
        _this.state = DH_STATES.IDLE;
        _this.__defaultOpts = {
            headers: {},
            override: false,
            fileName: ''
        };

        _this.__total = 0;
        _this.__downloaded = 0;
        _this.__progress = 0;
        _this.__states = DH_STATES;
        _this.__opts = Object.assign({}, _this.__defaultOpts, options);
        _this.__headers = _this.__opts.headers;
        _this.__isResumed = false;
        _this.__isResumable = false;
        _this.__isRedirected = false;
        _this.__destFolder = destFolder;
        _this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0
        };
        _this.__fileName = '';
        _this.__filePath = '';
        _this.__options = _this.__getOptions('GET', url, _this.__opts.headers);
        _this.__protocol = url.indexOf('https://') > -1 ? https : http;
        return _this;
    }

    _createClass(DownloaderHelper, [{
        key: 'start',
        value: function start() {
            var _this2 = this;

            return new Promise(function (resolve, reject) {
                if (!_this2.__isRedirected) {
                    _this2.emit('start');
                    _this2.__setState(_this2.__states.STARTED);
                }

                _this2.__request = _this2.__protocol.request(_this2.__options, function (response) {
                    //Stats
                    if (!_this2.__isResumed) {
                        _this2.__total = parseInt(response.headers['content-length']);
                        _this2.__downloaded = 0;
                        _this2.__progress = 0;
                    }

                    // Handle Redirects
                    if (response.statusCode > 300 && response.statusCode < 400 && response.headers.hasOwnProperty('location') && response.headers.location) {
                        _this2.__isRedirected = true;
                        _this2.__initProtocol(response.headers.location);
                        return _this2.start().then(function () {
                            return resolve(true);
                        }).catch(function (err) {
                            _this2.__setState(_this2.__states.FAILED);
                            _this2.emit('error', err);
                            return reject(err);
                        });
                    }

                    // check if response is success
                    if (response.statusCode !== 200 && response.statusCode !== 206) {
                        var err = new Error('Response status was ' + response.statusCode);
                        _this2.emit('error', err);
                        return reject(err);
                    }

                    if (response.headers.hasOwnProperty('accept-ranges') && response.headers['accept-ranges'] !== 'none') {
                        _this2.__isResumable = true;
                    }

                    // Get Filename
                    if (response.headers.hasOwnProperty('content-disposition') && response.headers['content-disposition'].indexOf('filename=') > -1) {

                        var fileName = response.headers['content-disposition'];
                        fileName = fileName.trim();
                        fileName = fileName.substr(fileName.indexOf('filename=') + 9);
                        fileName = fileName.replace(new RegExp('"', 'g'), '');

                        _this2.__fileName = fileName;
                    } else {
                        _this2.__fileName = path.basename(URL.parse(_this2.url).pathname);
                    }

                    // Create File
                    _this2.__fileName = _this2.__opts.fileName ? _this2.__opts.fileName : _this2.__fileName;
                    _this2.__filePath = path.join(_this2.__destFolder, _this2.__fileName);
                    if (!_this2.__opts.override) {
                        _this2.__filePath = _this2.__uniqFileNameSync(_this2.__filePath);
                    }
                    _this2.__fileStream = fs.createWriteStream(_this2.__filePath, _this2.__isResumed ? { 'flags': 'a' } : {});

                    // Start Downloading
                    _this2.emit('download');
                    _this2.__isResumed = false;
                    _this2.__isRedirected = false;
                    _this2.__setState(_this2.__states.DOWNLOADING);
                    _this2.__statsEstimate.time = new Date();

                    response.pipe(_this2.__fileStream);
                    response.on('data', function (chunk) {
                        return _this2.__calculateStats(chunk.length);
                    });

                    _this2.__fileStream.on('finish', function () {
                        _this2.__fileStream.close(function (_err) {
                            if (_err) {
                                return reject(_err);
                            }
                            if (_this2.state !== _this2.__states.PAUSED && _this2.state !== _this2.__states.STOPPED) {
                                _this2.__setState(_this2.__states.FINISHED);
                                _this2.emit('end');
                            }
                            return resolve(true);
                        });
                    });

                    _this2.__fileStream.on('error', function (err) {
                        _this2.__fileStream.close(function () {
                            fs.unlink(_this2.__filePath, function () {
                                return reject(err);
                            });
                        });
                        _this2.__setState(_this2.__states.FAILED);
                        _this2.emit('error', err);
                        return reject(err);
                    });
                });

                // Error Handling
                _this2.__request.on('error', function (err) {
                    if (_this2.__fileStream) {
                        _this2.__fileStream.close(function () {
                            fs.unlink(_this2.__filePath, function () {
                                return reject(err);
                            });
                        });
                    }
                    _this2.emit('error', err);
                    _this2.__setState(_this2.__states.FAILED);
                    return reject(err);
                });

                _this2.__request.end();
            });
        }
    }, {
        key: 'pause',
        value: function pause() {
            if (this.__request) {
                this.__request.abort();
            }
            if (this.__fileStream) {
                this.__fileStream.close();
            }
            this.__setState(this.__states.PAUSED);
            this.emit('pause');
            return Promise.resolve(true);
        }
    }, {
        key: 'resume',
        value: function resume() {
            var _this3 = this;

            this.__setState(this.__states.RESUMED);
            if (this.__isResumable) {
                this.__isResumed = true;
                this.__downloaded = this.__getFilesizeInBytes(this.__filePath);
                this.__options['headers']['range'] = 'bytes=' + this.__downloaded + '-';
            }
            this.emit('resume');
            return this.start().then(function () {
                return _this3.__isResumable;
            });
        }
    }, {
        key: 'stop',
        value: function stop() {
            var _this4 = this;

            if (this.__request) {
                this.__request.abort();
            }
            if (this.__fileStream) {
                this.__fileStream.close();
            }
            this.__setState(this.__states.STOPPED);
            return new Promise(function (resolve, reject) {
                fs.access(_this4.__filePath, function (_accessErr) {
                    // if can't access, probably is not created yet
                    if (_accessErr) {
                        _this4.emit('stop');
                        return resolve(true);
                    }

                    fs.unlink(_this4.__filePath, function (_err) {
                        if (_err) {
                            _this4.__setState(_this4.__states.FAILED);
                            _this4.emit('error', _err);
                            return reject(_err);
                        }
                        _this4.emit('stop');
                        resolve(true);
                    });
                });
            });
        }
    }, {
        key: '__calculateStats',
        value: function __calculateStats(receivedBytes) {
            var currentTime = new Date();
            var elaspsedTime = currentTime - this.__statsEstimate.time;

            this.__downloaded += receivedBytes;
            this.__progress = this.__downloaded / this.__total * 100;

            // emit the progress every second or if finished
            if (this.__downloaded === this.__total || elaspsedTime > 1000) {
                // Calculate the speed
                this.__statsEstimate.time = currentTime;
                this.__statsEstimate.bytes = this.__downloaded - this.__statsEstimate.prevBytes;
                this.__statsEstimate.prevBytes = this.__downloaded;

                this.emit('progress', {
                    total: this.__total,
                    downloaded: this.__downloaded,
                    progress: this.__progress,
                    speed: this.__statsEstimate.bytes
                });
            }
        }
    }, {
        key: '__setState',
        value: function __setState(state) {
            this.state = state;
            this.emit('stateChanged', this.state);
        }
    }, {
        key: '__getOptions',
        value: function __getOptions(method, url) {
            var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

            var urlParse = URL.parse(url);
            var options = {
                protocol: urlParse.protocol,
                host: urlParse.hostname,
                port: urlParse.port,
                path: urlParse.path,
                method: method
            };

            if (headers) {
                options['headers'] = headers;
            }

            return options;
        }
    }, {
        key: '__getFilesizeInBytes',
        value: function __getFilesizeInBytes(filePath) {
            var stats = fs.statSync(filePath);
            var fileSizeInBytes = stats.size;
            return fileSizeInBytes;
        }
    }, {
        key: '__validate',
        value: function __validate(url, destFolder) {

            if (typeof url !== 'string') {
                throw new Error('URL should be an string');
            }

            if (!url) {
                throw new Error("URL couldn't be empty");
            }

            if (typeof destFolder !== 'string') {
                throw new Error('Destination Folder should be an string');
            }

            if (!destFolder) {
                throw new Error("Destination Folder couldn't be empty");
            }

            if (!fs.existsSync(destFolder)) {
                throw new Error('Destination Folder must exist');
            }

            return true;
        }
    }, {
        key: '__initProtocol',
        value: function __initProtocol(url) {
            this.url = url;
            this.__options = this.__getOptions('GET', url, this.__headers);
            this.__protocol = url.indexOf('https://') > -1 ? https : http;
        }
    }, {
        key: '__uniqFileNameSync',
        value: function __uniqFileNameSync(path) {
            if (typeof path !== 'string' || path === '') {
                return path;
            }

            try {
                fs.accessSync(path, fs.F_OK);
                var pathInfo = path.match(/(.*)(\([0-9]+\))(\..*)$/);
                var base = pathInfo ? pathInfo[1].trim() : path;
                var suffix = pathInfo ? parseInt(pathInfo[2].replace(/\(|\)/, '')) : 0;
                var ext = path.split('.').pop();

                if (ext !== path) {
                    ext = '.' + ext;
                    base = base.replace(ext, '');
                } else {
                    ext = '';
                }

                return this.__uniqFileNameSync(base + ' (' + ++suffix + ')' + ext);
            } catch (err) {
                return path;
            }
        }
    }]);

    return DownloaderHelper;
}(_events.EventEmitter);
