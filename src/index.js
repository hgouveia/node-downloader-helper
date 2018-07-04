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
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    STOPPED: 'STOPPED',
    FINISHED: 'FINISHED',
    FAILED: 'FAILED'
}

export class DownloaderHelper extends EventEmitter {
    constructor(url, destFolder, options = {}) {
        super();

        if (!this.__validate(url, destFolder)) {
            return;
        }

        this.url = url;
        this.state = DH_STATES.IDLE;
        this.__defaultOpts = {
            headers: {},
            override: false,
            fileName: ''
        };

        this.__total = 0;
        this.__downloaded = 0;
        this.__progress = 0;
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
        this.__options = this.__getOptions('GET', url, this.__opts.headers);
        this.__protocol = (url.indexOf('https://') > -1)
            ? https
            : http;
    }

    start() {
        return new Promise((resolve, reject) => {
            if (!this.__isRedirected) {
                this.emit('start');
                this.__setState(this.__states.STARTED);
            }

            this.__request = this.__protocol.request(this.__options, response => {
                //Stats
                if (!this.__isResumed) {
                    this.__total = parseInt(response.headers['content-length']);
                    this.__downloaded = 0;
                    this.__progress = 0;
                }

                // Handle Redirects
                if (response.statusCode > 300 && response.statusCode < 400 &&
                    response.headers.hasOwnProperty('location') && response.headers.location) {
                    this.__isRedirected = true;
                    this.__initProtocol(response.headers.location);
                    return this.start()
                        .then(() => resolve(true))
                        .catch(err => {
                            this.__setState(this.__states.FAILED);
                            this.emit('error', err);
                            return reject(err);
                        });
                }

                // check if response is success
                if (response.statusCode !== 200 && response.statusCode !== 206) {
                    const err = new Error('Response status was ' + response.statusCode);
                    this.emit('error', err);
                    return reject(err);
                }

                if (response.headers.hasOwnProperty('accept-ranges') &&
                    response.headers['accept-ranges'] !== 'none') {
                    this.__isResumable = true;
                }

                // Get Filename
                if (response.headers.hasOwnProperty('content-disposition') &&
                    response.headers['content-disposition'].indexOf('filename=') > -1) {

                    let fileName = response.headers['content-disposition'];
                    fileName = fileName.trim();
                    fileName = fileName.substr(fileName.indexOf('filename=') + 9);
                    fileName = fileName.replace(new RegExp('"', 'g'), '');

                    this.__fileName = fileName;
                } else {
                    this.__fileName = path.basename(URL.parse(this.url).pathname);
                }

                // Create File
                this.__fileName = (this.__opts.fileName)
                    ? this.__opts.fileName
                    : this.__fileName;
                this.__filePath = path.join(this.__destFolder, this.__fileName);
                if (!this.__opts.override) {
                    this.__filePath = this.__uniqFileNameSync(this.__filePath);
                }
                this.__fileStream = fs.createWriteStream(this.__filePath,
                    this.__isResumed ? { 'flags': 'a' } : {});

                // Start Downloading
                this.emit('download');
                this.__isResumed = false;
                this.__isRedirected = false;
                this.__setState(this.__states.DOWNLOADING);
                this.__statsEstimate.time = new Date();

                response.pipe(this.__fileStream);
                response.on('data', chunk => this.__calculateStats(chunk.length));

                this.__fileStream.on('finish', () => {
                    this.__fileStream.close(_err => {
                        if (_err) {
                            return reject(_err);
                        }
                        if (this.state !== this.__states.PAUSED &&
                            this.state !== this.__states.STOPPED) {
                            this.__setState(this.__states.FINISHED);
                            this.emit('end');
                        }
                        return resolve(true);
                    });
                });


                this.__fileStream.on('error', err => {
                    this.__fileStream.close(() => {
                        fs.unlink(this.__filePath, () => reject(err));
                    });
                    this.__setState(this.__states.FAILED);
                    this.emit('error', err);
                    return reject(err);
                });
            });

            // Error Handling
            this.__request.on('error', err => {
                if (this.__fileStream) {
                    this.__fileStream.close(() => {
                        fs.unlink(this.__filePath, () => reject(err));
                    });
                }
                this.emit('error', err);
                this.__setState(this.__states.FAILED);
                return reject(err);
            });

            this.__request.end();
        });
    }

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

    resume() {
        this.__setState(this.__states.RESUMED);
        if (this.__isResumable) {
            this.__isResumed = true;
            this.__downloaded = this.__getFilesizeInBytes(this.__filePath);
            this.__options['headers']['range'] = 'bytes=' + this.__downloaded + '-';
        }
        this.emit('resume');
        return this.start()
            .then(() => this.__isResumable);
    }

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

    __calculateStats(receivedBytes) {
        const currentTime = new Date();
        const elaspsedTime = currentTime - this.__statsEstimate.time;

        this.__downloaded += receivedBytes;
        this.__progress = (this.__downloaded / this.__total) * 100;

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

    __setState(state) {
        this.state = state;
        this.emit('stateChanged', this.state);
    }

    __getOptions(method, url, headers = {}) {
        let urlParse = URL.parse(url);
        let options = {
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

    __getFilesizeInBytes(filePath) {
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }

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

    __initProtocol(url) {
        this.url = url;
        this.__options = this.__getOptions('GET', url, this.__headers);
        this.__protocol = (url.indexOf('https://') > -1)
            ? https
            : http;
    }


    __uniqFileNameSync(path) {
        if (typeof path !== 'string' || path === '') {
            return path;
        }

        try {
            fs.accessSync(path, fs.F_OK);
            let pathInfo = path.match(/(.*)(\([0-9]+\))(\..*)$/);
            let base = pathInfo ? pathInfo[1].trim() : path;
            let suffix = pathInfo ? parseInt(pathInfo[2].replace(/\(|\)/, '')) : 0;
            let ext = path.split('.').pop();

            if (ext !== path) {
                ext = '.' + ext;
                base = base.replace(ext, '');
            } else {
                ext = '';
            }

            return this.__uniqFileNameSync(base + ' (' + (++suffix) + ')' + ext);
        } catch (err) {
            return path;
        }
    }
}