import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as URL from 'url';

export const DH_STATES = {
    IDLE: 'IDLE',
    STARTED: 'STARTED',
    DOWNLOADING: 'DOWNLOADING',
    RETRY: 'RETRY',
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    STOPPED: 'STOPPED',
    FINISHED: 'FINISHED',
    FAILED: 'FAILED'
};

export class DownloaderHelper extends EventEmitter {

    /**
     * Creates an instance of DownloaderHelper.
     * @param {String} url
     * @param {String} destFolder
     * @param {Object} [options={}]
     * @memberof DownloaderHelper
     */
    constructor(url, destFolder, options = {}) {
        super();

        if (!this.__validate(url, destFolder)) {
            return;
        }

        this.url = this.requestURL = url;
        this.state = DH_STATES.IDLE;
        this.__defaultOpts = {
            retry: false, // { maxRetries: 3, delay: 3000 }
            method: 'GET',
            headers: {},
            fileName: '',
            override: false,
            forceResume: false,
            httpRequestOptions: {},
            httpsRequestOptions: {}
        };

        this.__pipes = [];
        this.__total = 0;
        this.__downloaded = 0;
        this.__progress = 0;
        this.__retryCount = 0;
        this.__states = DH_STATES;
        this.__opts = Object.assign({}, this.__defaultOpts, options);
        this.__headers = this.__opts.headers;
        this.__isResumed = false;
        this.__isResumable = false;
        this.__isRedirected = false;
        this.__destFolder = destFolder;
        this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0
        };
        this.__fileName = '';
        this.__filePath = '';
        this.__options = this.__getOptions(this.__opts.method, url, this.__opts.headers);
        this.__initProtocol(url);
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    start() {
        return new Promise((resolve, reject) => {
            if (!this.__isRedirected &&
                this.state !== this.__states.RESUMED) {
                this.emit('start');
                this.__setState(this.__states.STARTED);
            }

            // Start the Download
            this.__request = this.__downloadRequest(resolve, reject);

            // Error Handling
            this.__request.on('error', this.__onError(resolve, reject));
            this.__request.on('timeout', () => this.emit('timeout'));

            this.__request.end();
        });
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    pause() {
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

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    resume() {
        this.__setState(this.__states.RESUMED);
        if (this.__isResumable) {
            this.__isResumed = true;
            this.__downloaded = this.__getFilesizeInBytes(this.__filePath);
            this.__options['headers']['range'] = 'bytes=' + this.__downloaded + '-';
        }
        this.emit('resume');
        return this.start();
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    stop() {
        if (this.__request) {
            this.__request.abort();
        }
        if (this.__fileStream) {
            this.__fileStream.close();
        }
        this.__setState(this.__states.STOPPED);
        return new Promise((resolve, reject) => {
            fs.access(this.__filePath, _accessErr => {
                // if can't access, probably is not created yet
                if (_accessErr) {
                    this.emit('stop');
                    return resolve(true);
                }

                fs.unlink(this.__filePath, _err => {
                    if (_err) {
                        this.__setState(this.__states.FAILED);
                        this.emit('error', _err);
                        return reject(_err);
                    }
                    this.emit('stop');
                    resolve(true);
                });
            });
        });
    }

    /**
     *
     * @url https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options
     * @param {stream.Writable} stream
     * @param {Object} [options=null]
     * @returns {DownloaderHelper}
     * @memberof DownloaderHelper
     */
    pipe(stream, options = null) {
        this.__pipes.push({ stream, options });
        return this;
    }

    /**
     *
     *
     * @returns {String}
     * @memberof DownloaderHelper
     */
    getDownloadPath() {
        return this.__filePath;
    }

    /**
     *
     *
     * @returns {Boolean}
     * @memberof DownloaderHelper
     */
    isResumable() {
        return this.__isResumable;
    }


    /**
     *
     *
     * @param {Promise.resolve} resolve
     * @param {Promise.reject} reject
     * @returns {http.ClientRequest}
     * @memberof DownloaderHelper
     */
    __downloadRequest(resolve, reject) {
        return this.__protocol.request(this.__options, response => {
            //Stats
            if (!this.__isResumed) {
                this.__total = parseInt(response.headers['content-length']);
                this.__resetStats();
            }

            // Handle Redirects
            if (response.statusCode > 300 && response.statusCode < 400 &&
                response.headers.hasOwnProperty('location') && response.headers.location) {
                this.__isRedirected = true;
                this.__initProtocol(response.headers.location);
                // returns a new promise of the start process with the new url
                // and resolve this current promise when the new operation finishes
                return this.start()
                    .then(() => resolve(true))
                    .catch(err => {
                        this.__setState(this.__states.FAILED);
                        this.emit('error', err);
                        return reject(err);
                    });
            }

            // check if response wans't a success
            if (response.statusCode !== 200 && response.statusCode !== 206) {
                const err = new Error(`Response status was ${response.statusCode}`);
                err.status = response.statusCode || 0;
                err.body = response.body || '';
                this.emit('error', err);
                return reject(err);
            }

            if (this.__opts.forceResume) {
                this.__isResumable = true;
            } else if (response.headers.hasOwnProperty('accept-ranges') &&
                response.headers['accept-ranges'] !== 'none') {
                this.__isResumable = true;
            }

            this.__startDownload(response, resolve, reject);
        });
    }

    /**
     *
     *
     * @param {http.IncomingMessage} response
     * @param {Promise.resolve} resolve
     * @param {Promise.reject} reject
     * @memberof DownloaderHelper
     */
    __startDownload(response, resolve, reject) {
        if (!this.__isResumed) {
            const _fileName = this.__getFileNameFromHeaders(response.headers);
            this.__filePath = this.__getFilePath(_fileName);
            this.__fileName = this.__filePath.split(path.sep).pop();
            this.__fileStream = fs.createWriteStream(this.__filePath, {});
        } else {
            this.__fileStream = fs.createWriteStream(this.__filePath, { 'flags': 'a' });
        }

        // Start Downloading
        this.emit('download', {
            fileName: this.__fileName,
            filePath: this.__filePath,
            totalSize: this.__total,
            isResumed: this.__isResumed,
            downloadedSize: this.__downloaded
        });
        this.__isResumed = false;
        this.__isRedirected = false;
        this.__setState(this.__states.DOWNLOADING);
        this.__statsEstimate.time = new Date();

        response.pipe(this.__fileStream);
        response.on('data', chunk => this.__calculateStats(chunk.length));

        // Add externals pipe
        this.__pipes.forEach(pipe => response.pipe(pipe.stream, pipe.options));

        this.__fileStream.on('finish', this.__onFinished(resolve, reject));
        this.__fileStream.on('error', this.__onError(resolve, reject));
        response.on('error', this.__onError(resolve, reject));
    }

    /**
    *
    *
    * @param {Promise.resolve} resolve
    * @param {Promise.reject} reject
    * @returns {Function}
    * @memberof DownloaderHelper
    */
    __onFinished(resolve, reject) {
        return () => {
            this.__fileStream.close(_err => {
                if (_err) {
                    return reject(_err);
                }
                if (this.state !== this.__states.PAUSED &&
                    this.state !== this.__states.STOPPED) {
                    this.__setState(this.__states.FINISHED);
                    this.__pipes = [];
                    this.emit('end', {
                        fileName: this.__fileName,
                        filePath: this.__filePath,
                        totalSize: this.__total,
                        downloadedSize: this.__downloaded
                    });
                }
                return resolve(true);
            });
        };
    }

    /**
     *
     *
     * @param {Promise.reject} reject
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    __onError(resolve, reject) {
        return err => {
            if (this.__fileStream) {
                this.__fileStream.close(() => fs.unlink(this.__filePath, () => reject(err)));
            }
            this.__pipes = [];
            this.__setState(this.__states.FAILED);
            this.emit('error', err);

            if (!this.__opts.retry) {
                return reject(err);
            }

            return this.__retry()
                .then(() => resolve(true))
                .catch(_err => reject(_err ? _err : err));
        };
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    __retry() {
        if (!this.__opts.retry) {
            return Promise.reject();
        }

        if (typeof this.__opts.retry !== 'object' ||
            !this.__opts.retry.hasOwnProperty('maxRetries') ||
            !this.__opts.retry.hasOwnProperty('delay')) {
            const _err = new Error('wrong retry options');
            this.__setState(this.__states.FAILED);
            this.emit('error', _err);
            return Promise.reject(_err);
        }

        // reached the maximum retries
        if (this.__retryCount >= this.__opts.retry.maxRetries) {
            return Promise.reject();
        }

        this.__retryCount++;
        this.__setState(this.__states.RETRY);
        this.emit('retry', this.__retryCount, this.__opts.retry);

        return new Promise((resolve) =>
            setTimeout(() => resolve(this.start()), this.__opts.retry.delay)
        );
    }

    /**
     *
     *
     * @memberof DownloaderHelper
     */
    __resetStats() {
        this.__retryCount = 0;
        this.__downloaded = 0;
        this.__progress = 0;
        this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0
        };
    }

    /**
     *
     *
     * @param {Object} headers
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __getFileNameFromHeaders(headers) {
        let fileName = '';

        // Get Filename
        if (headers.hasOwnProperty('content-disposition') &&
            headers['content-disposition'].indexOf('filename=') > -1) {

            fileName = headers['content-disposition'];
            fileName = fileName.trim();
            fileName = fileName.substr(fileName.indexOf('filename=') + 9);
            fileName = fileName.replace(new RegExp('"', 'g'), '');
        } else {
            fileName = path.basename(URL.parse(this.requestURL).pathname);
        }

        return (this.__opts.fileName)
            ? this.__getFileNameFromOpts(fileName)
            : fileName;
    }

    /**
     *
     *
     * @param {String} fileName
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __getFilePath(fileName) {
        const currentPath = path.join(this.__destFolder, fileName);
        let filePath = currentPath;

        if (!this.__opts.override && this.state !== this.__states.RESUMED) {
            filePath = this.__uniqFileNameSync(filePath);

            if (currentPath !== filePath) {
                this.emit('renamed', {
                    'path': filePath,
                    'fileName': filePath.split(path.sep).pop(),
                    'prevPath': currentPath,
                    'prevFileName': currentPath.split(path.sep).pop()
                });
            }
        }

        return filePath;
    }


    /**
     *
     *
     * @param {String} fileName
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __getFileNameFromOpts(fileName) {

        if (!this.__opts.fileName) {
            return fileName;
        } else if (typeof this.__opts.fileName === 'string') {
            return this.__opts.fileName;
        } else if (typeof this.__opts.fileName === 'function') {
            const currentPath = path.join(this.__destFolder, fileName);
            return this.__opts.fileName(fileName, currentPath);
        } else if (typeof this.__opts.fileName === 'object') {

            const fileNameOpts = this.__opts.fileName;  // { name:string, ext:true|false|string} 
            const name = fileNameOpts.name;
            const ext = fileNameOpts.hasOwnProperty('ext')
                ? fileNameOpts.ext : false;

            if (typeof ext === 'string') {
                return `${name}.${ext}`;
            } else if (typeof ext === 'boolean') {
                // true: use the 'name' as full file name
                // false (default) only replace the name
                if (ext) {
                    return name;
                } else {
                    const _ext = fileName.split('.').pop();
                    return `${name}.${_ext}`;
                }
            }
        }

        return fileName;
    }

    /**
     *
     *
     * @param {Number} receivedBytes
     * @memberof DownloaderHelper
     */
    __calculateStats(receivedBytes) {
        const currentTime = new Date();
        const elaspsedTime = currentTime - this.__statsEstimate.time;

        if (!receivedBytes) {
            return;
        }

        this.__downloaded += receivedBytes;
        this.__progress = (this.__downloaded / this.__total) * 100;

        // Calculate the speed every second or if finished
        if (this.__downloaded === this.__total || elaspsedTime > 1000) {
            this.__statsEstimate.time = currentTime;
            this.__statsEstimate.bytes = this.__downloaded - this.__statsEstimate.prevBytes;
            this.__statsEstimate.prevBytes = this.__downloaded;
        }

        // emit the progress
        this.emit('progress', {
            total: this.__total,
            downloaded: this.__downloaded,
            progress: this.__progress,
            speed: this.__statsEstimate.bytes
        });
    }

    /**
     *
     *
     * @param {String} state
     * @memberof DownloaderHelper
     */
    __setState(state) {
        this.state = state;
        this.emit('stateChanged', this.state);
    }

    /**
     *
     *
     * @param {String} method
     * @param {String} url
     * @param {Object} [headers={}]
     * @returns {Object}
     * @memberof DownloaderHelper
     */
    __getOptions(method, url, headers = {}) {
        const urlParse = URL.parse(url);
        const options = {
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

    /**
     *
     *
     * @param {String} filePath
     * @returns {Number}
     * @memberof DownloaderHelper
     */
    __getFilesizeInBytes(filePath) {
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }

    /**
     *
     *
     * @param {String} url
     * @param {String} destFolder
     * @returns {Boolean|Error}
     * @memberof DownloaderHelper
     */
    __validate(url, destFolder) {

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

    /**
     *
     *
     * @param {String} url
     * @memberof DownloaderHelper
     */
    __initProtocol(url) {
        const defaultOpts = this.__getOptions(this.__opts.method, url, this.__headers);
        this.requestURL = url;

        if (url.indexOf('https://') > -1) {
            this.__protocol = https;
            this.__options = Object.assign({}, defaultOpts, this.__opts.httpsRequestOptions);
        } else {
            this.__protocol = http;
            this.__options = Object.assign({}, defaultOpts, this.__opts.httpRequestOptions);
        }

    }

    /**
     *
     *
     * @param {String} path
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __uniqFileNameSync(path) {
        if (typeof path !== 'string' || path === '') {
            return path;
        }

        try {
            // if access fail, the file doesnt exist yet
            fs.accessSync(path, fs.F_OK);
            const pathInfo = path.match(/(.*)(\([0-9]+\))(\..*)$/);
            let base = pathInfo ? pathInfo[1].trim() : path;
            let suffix = pathInfo ? parseInt(pathInfo[2].replace(/\(|\)/, '')) : 0;
            let ext = path.split('.').pop();

            if (ext !== path) {
                ext = '.' + ext;
                base = base.replace(ext, '');
            } else {
                ext = '';
            }

            // generate a new path until it doesn't exist
            return this.__uniqFileNameSync(base + ' (' + (++suffix) + ')' + ext);
        } catch (err) {
            return path;
        }
    }
}
