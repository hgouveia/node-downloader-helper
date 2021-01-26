import { EventEmitter } from 'events';
import stream from 'stream';

type Stats = {
  total: number;
  name: string;
  downloaded: number;
  progress: number;
  speed: number;
}

export const DH_STATES: {
  IDLE: 'IDLE';
  SKIPPED: 'SKIPPED';
  STARTED: 'STARTED';
  DOWNLOADING: 'DOWNLOADING';
  RETRY: 'RETRY';
  PAUSED: 'PAUSED';
  RESUMED: 'RESUMED';
  STOPPED: 'STOPPED';
  FINISHED: 'FINISHED';
  FAILED: 'FAILED';
}

export class DownloaderHelper extends EventEmitter {
  /**
   * Creates an instance of DownloaderHelper.
   * @param {String} url
   * @param {String} destFolder
   * @param {Object} [options={}]
   * @memberof DownloaderHelper
   */
  constructor(url: string, destFolder: string, options?: object);

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  start(): Promise<boolean>;

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  pause(): Promise<boolean>;

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  resume(): Promise<boolean>;

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  stop(): Promise<boolean>;

  /**
   * Add pipes to the pipe list that will be applied later when the download starts
   * @url https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options
   * @param {stream.Readable} stream https://nodejs.org/api/stream.html#stream_class_stream_readable
   * @param {Object} [options=null]
   * @returns {stream.Readable}
   * @memberof DownloaderHelper
   */
  pipe(stream: stream.Readable, options?: object): stream.Readable;

  /**
   * Unpipe an stream , if a stream is not specified, then all pipes are detached.
   *
   * @url https://nodejs.org/api/stream.html#stream_readable_unpipe_destination
   * @param {stream.Readable} [stream=null]
   * @returns
   * @memberof DownloaderHelper
   */
  unpipe(stream?: stream.Readable): void;

  /**
   * Where the download will be saved
   *
   * @returns {String}
   * @memberof DownloaderHelper
   */
  getDownloadPath(): string;

  /**
   * Indicates if the download can be resumable (available after the start phase)
   *
   * @returns {Boolean}
   * @memberof DownloaderHelper
   */
  isResumable(): boolean;

  /**
   * Updates the options, can be use on pause/resume events
   *
   * @param {Object} [options={}]
   * @memberof DownloaderHelper
   */
  updateOptions(options?: object): void;

  /**
   * Current download progress stats
   *
   * @returns {Stats}
   * @memberof DownloaderHelper
   */
  getStats(): Stats;

  /**
   * Gets the total file size from the server
   *
   * @returns {Promise<{name:string, total:number}>}
   * @memberof DownloaderHelper
   */
  getTotalSize(): Promise<{name: string; total: number}>;
}
