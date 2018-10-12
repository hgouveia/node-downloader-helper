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

        _this.url = _this.requestURL = url;
        _this.state = DH_STATES.IDLE;
        _this.__defaultOpts = {
            method: 'GET',
            headers: {},
            fileName: '',
            override: false,
            httpRequestOptions: {},
            httpsRequestOptions: {}
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
        _this.__options = _this.__getOptions(_this.__opts.method, url, _this.__opts.headers);
        _this.__initProtocol(url);
        return _this;
    }

    _createClass(DownloaderHelper, [{
        key: 'start',
        value: function start() {
            var _this2 = this;

            return new Promise(function (resolve, reject) {
                if (!_this2.__isRedirected && _this2.state !== _this2.__states.RESUMED) {
                    _this2.emit('start');
                    _this2.__setState(_this2.__states.STARTED);
                }

                // Start the Download
                _this2.__request = _this2.__downloadRequest(resolve, reject);

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
            this.__setState(this.__states.RESUMED);
            if (this.__isResumable) {
                this.__isResumed = true;
                this.__downloaded = this.__getFilesizeInBytes(this.__filePath);
                this.__options['headers']['range'] = 'bytes=' + this.__downloaded + '-';
            }
            this.emit('resume');
            return this.start();
        }
    }, {
        key: 'stop',
        value: function stop() {
            var _this3 = this;

            if (this.__request) {
                this.__request.abort();
            }
            if (this.__fileStream) {
                this.__fileStream.close();
            }
            this.__setState(this.__states.STOPPED);
            return new Promise(function (resolve, reject) {
                fs.access(_this3.__filePath, function (_accessErr) {
                    // if can't access, probably is not created yet
                    if (_accessErr) {
                        _this3.emit('stop');
                        return resolve(true);
                    }

                    fs.unlink(_this3.__filePath, function (_err) {
                        if (_err) {
                            _this3.__setState(_this3.__states.FAILED);
                            _this3.emit('error', _err);
                            return reject(_err);
                        }
                        _this3.emit('stop');
                        resolve(true);
                    });
                });
            });
        }
    }, {
        key: 'isResumable',
        value: function isResumable() {
            return this.__isResumable;
        }
    }, {
        key: '__downloadRequest',
        value: function __downloadRequest(resolve, reject) {
            var _this4 = this;

            return this.__protocol.request(this.__options, function (response) {
                //Stats
                if (!_this4.__isResumed) {
                    _this4.__total = parseInt(response.headers['content-length']);
                    _this4.__downloaded = 0;
                    _this4.__progress = 0;
                }

                // Handle Redirects
                if (response.statusCode > 300 && response.statusCode < 400 && response.headers.hasOwnProperty('location') && response.headers.location) {
                    _this4.__isRedirected = true;
                    _this4.__initProtocol(response.headers.location);
                    return _this4.start().then(function () {
                        return resolve(true);
                    }).catch(function (err) {
                        _this4.__setState(_this4.__states.FAILED);
                        _this4.emit('error', err);
                        return reject(err);
                    });
                }

                // check if response is success
                if (response.statusCode !== 200 && response.statusCode !== 206) {
                    var err = new Error('Response status was ' + response.statusCode);
                    _this4.emit('error', err);
                    return reject(err);
                }

                if (response.headers.hasOwnProperty('accept-ranges') && response.headers['accept-ranges'] !== 'none') {
                    _this4.__isResumable = true;
                }

                _this4.__startDownload(response, resolve, reject);
            });
        }
    }, {
        key: '__startDownload',
        value: function __startDownload(response, resolve, reject) {
            var _this5 = this;

            this.__fileName = this.__getFileNameFromHeaders(response.headers);
            this.__filePath = this.__getFilePath(this.__fileName);
            this.__fileStream = fs.createWriteStream(this.__filePath, this.__isResumed ? { 'flags': 'a' } : {});

            // Start Downloading
            this.emit('download');
            this.__isResumed = false;
            this.__isRedirected = false;
            this.__setState(this.__states.DOWNLOADING);
            this.__statsEstimate.time = new Date();

            response.pipe(this.__fileStream);
            response.on('data', function (chunk) {
                return _this5.__calculateStats(chunk.length);
            });

            this.__fileStream.on('finish', function () {
                _this5.__fileStream.close(function (_err) {
                    if (_err) {
                        return reject(_err);
                    }
                    if (_this5.state !== _this5.__states.PAUSED && _this5.state !== _this5.__states.STOPPED) {
                        _this5.__setState(_this5.__states.FINISHED);
                        _this5.emit('end');
                    }
                    return resolve(true);
                });
            });

            this.__fileStream.on('error', function (err) {
                _this5.__fileStream.close(function () {
                    fs.unlink(_this5.__filePath, function () {
                        return reject(err);
                    });
                });
                _this5.__setState(_this5.__states.FAILED);
                _this5.emit('error', err);
                return reject(err);
            });
        }
    }, {
        key: '__getFileNameFromHeaders',
        value: function __getFileNameFromHeaders(headers) {
            var fileName = '';

            if (this.__opts.fileName) {
                return this.__opts.fileName;
            }

            // Get Filename
            if (headers.hasOwnProperty('content-disposition') && headers['content-disposition'].indexOf('filename=') > -1) {

                fileName = headers['content-disposition'];
                fileName = fileName.trim();
                fileName = fileName.substr(fileName.indexOf('filename=') + 9);
                fileName = fileName.replace(new RegExp('"', 'g'), '');
            } else {
                fileName = path.basename(URL.parse(this.requestURL).pathname);
            }

            return fileName;
        }
    }, {
        key: '__getFilePath',
        value: function __getFilePath(fileName) {
            var filePath = path.join(this.__destFolder, fileName);

            if (!this.__opts.override && this.state !== this.__states.RESUMED) {
                filePath = this.__uniqFileNameSync(filePath);
            }

            return filePath;
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
            var defaultOpts = this.__getOptions(this.__opts.method, url, this.__headers);
            this.requestURL = url;

            if (url.indexOf('https://') > -1) {
                this.__protocol = https;
                this.__options = Object.assign({}, defaultOpts, this.__opts.httpsRequestOptions);
            } else {
                this.__protocol = http;
                this.__options = Object.assign({}, defaultOpts, this.__opts.httpRequestOptions);
            }
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
