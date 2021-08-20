import { EventEmitter } from 'events';
import stream from 'stream';

type Stats = {
  total: number;
  name: string;
  downloaded: number;
  progress: number;
  speed: number;
}

export enum DH_STATES {
  IDLE = 'IDLE',
  SKIPPED = 'SKIPPED',
  STARTED = 'STARTED',
  DOWNLOADING = 'DOWNLOADING',
  RETRY = 'RETRY',
  PAUSED = 'PAUSED',
  RESUMED = 'RESUMED',
  STOPPED = 'STOPPED',
  FINISHED = 'FINISHED',
  FAILED = 'FAILED',
}

interface BaseStats {
  /** total file size got from the server */
  totalSize: number;
  /** original file name */
  fileName: string;
  /** original path name */
  filePath: string;
  /** the downloaded amount */
  downloadedSize: number;
}

interface DownloadInfoStats extends BaseStats {
  /** if the download is a resume */
  isResumed: boolean;
}

interface DownloadEndedStats extends BaseStats {
  /** total size of file on the disk */
  onDiskSize: number;
  /** true/false if the download endend but still incomplete */
  incomplete: boolean;
}

interface FileRenamedStats {
  /** modified path name */
  path: string;
  /** modified file name */
  fileName: string;
  /** original path name */
  prevPath: string;
  /** original file name */
  prevFileName: string;
}

interface ErrorStats {
  /** Error message */
  message: string;
  /** Http status response if available */
  status?: string;
  /** Http body response if available */
  body?: string;
}
interface DownloadEvents {
  /** Emitted when the .start method is called */
  start: () => any;
  /** Emitted when the download is skipped because the file already exists */
  skip: (stats: BaseStats) => any;
  /** Emitted when the download starts */
  download: (stats: DownloadInfoStats) => any;
  /**	Emitted every time gets data from the server */
  progress: (stats: Stats) => any;
  /** The same as progress but emits every 1 second while is downloading */
  "progress.throttled": (stats: Stats) => any;
  /** Emitted when the download fails and retry is enabled */
  retry: (attempt: any, retryOptions: RetryOptions, error: Error | null) => any;
  /** Emitted when the downloading has finished */
  end: (stats: DownloadEndedStats) => any;
  /** Emitted when there is any error */
  error: (stats: ErrorStats) => any;
  /**	Emitted when the underlying socket times out from inactivity. */
  timeout: () => any;
  /** Emitted when the .pause method is called */
  pause: () => any;
  /** Emitted when the .resume method is called */
  resume: (isResume: boolean) => any;
  /** Emitted when the .stop method is called */
  stop: () => any;
  /** Emitted when '(number)' is appended to the end of file, this requires override:false opt, callback(filePaths) */
  renamed: (stats: FileRenamedStats) => any;
  /** Emitted when the state changes */
  stateChanged: (state: DH_STATES) => any;
}
type FilenameCallback = (fileName: string, filePath: string) => string;
interface FilenameDefinition {
  name: string;
  /** The extension of the file. It may be a boolean: `true` will use the `name` property as the full file name (including the extension),
  `false` will keep the extension of the downloaded file.
  
  (default:false) */
  ext?: string | boolean;
}
interface RetryOptions {
  maxRetries: number;
  /** in milliseconds */
  delay: number;
}
interface OverrideOptions {
  skip?: boolean;
  skipSmaller?: boolean;
}
interface DownloaderHelperOptions {
  /** Request Method Verb */
  method?: "GET" | "PUT" | "POST" | "DELETE" | "OPTIONS",
  /** Custom HTTP Header ex: Authorization, User-Agent */
  headers?: object;
  /** Custom filename when saved */
  fileName?: string | FilenameCallback | FilenameDefinition;
  retry?: boolean | RetryOptions;
  /** If the server does not return the "accept-ranges" header, can be force if it does support it */
  forceResume?: boolean;
  /** remove the file when is stopped (default:true) */
  removeOnStop?: boolean;
  /** remove the file when fail (default:true) */
  removeOnFail?: boolean;
  /** Behavior when local file already exists (default:false)*/
  override?: boolean | OverrideOptions;
  /** Override the http request options */
  httpRequestOptions?: object;
  /** Override the https request options, ex: to add SSL Certs */
  httpsRequestOptions?: object;
}
export class DownloaderHelper extends EventEmitter {
  /**
   * Creates an instance of DownloaderHelper.
   * @param {String} url
   * @param {String} destFolder
   * @param {Object} [options={}]
   * @memberof DownloaderHelper
   */
  constructor(url: string, destFolder: string, options?: DownloaderHelperOptions);

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
  getTotalSize(): Promise<{ name: string; total: number }>;

  /**
   * Subscribes to events
   * 
   * @memberof EventEmitter
   */
  on<E extends keyof DownloadEvents>(event: E, callback: DownloadEvents[E]): any;
}
