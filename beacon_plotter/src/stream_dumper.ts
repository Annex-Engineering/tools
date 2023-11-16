import EventEmitter from "eventemitter3";
import { createStore } from "solid-js/store";

export interface Sample {
  dist: number;
  freq: number;
  pos: [number, number, number] | null;
  temp: number;
  time: number;
  vel: number | null;
}

export interface BeaconStreamEvents {
  connected: void;
  disconnected: void;
  error: [string];
  has_header: [string[]];
  samples: [Sample[]];
}

export interface BeaconStreamState {
  receiving: boolean;
  connected: boolean;
  connecting: boolean;
  last_error?: string;
}

export class BeaconStreamDumper extends EventEmitter<BeaconStreamEvents> {
  readonly api_url;
  private next_id = 0;
  private ws?: WebSocket;
  private header?: string[];
  private base_time?: number;

  readonly state: BeaconStreamState;
  private update;

  constructor(api_url: string) {
    super();

    [this.state, this.update] = createStore<BeaconStreamState>({
      receiving: false,
      connected: false,
      connecting: false,
    });

    this.api_url = api_url;
    this.connect();
  }

  private connect() {
    this.disconnect();
    this.ws = new WebSocket(this.api_url);
    this.update("connecting", true);
    this.ws.addEventListener("open", this.on_open.bind(this));
    this.ws.addEventListener("close", this.on_close.bind(this));
    this.ws.addEventListener("message", this.on_message.bind(this));
  }

  disconnect() {
    this.update("connected", false);
    if (!this.ws) return;
    this.ws.close();
    this.ws = undefined;
    this.header = undefined;
  }

  private on_open() {
    this.update({ connected: true, connecting: false });
    this.emit("connected");
    this.send({ method: "beacon/dump" });
  }

  private on_close(event: CloseEvent) {
    if (!event.wasClean) {
      const reason = event.reason || `error code ${event.code}`;
      this.update("last_error", reason);
      this.emit("error", reason);
    }
    this.update(() => ({
      connected: false,
      receiving: false,
      connecting: false,
    }));
    this.emit("disconnected");
    this.ws = undefined;
  }

  private send<T extends object>(msg: T) {
    if (!this.ws) return;
    const id = this.next_id++;
    this.ws.send(JSON.stringify({ id, ...msg }));
  }

  private on_message(event: MessageEvent) {
    const input = JSON.parse(
      event.data.replaceAll(/(-)?Infinity/gm, '"$1inf"'),
    );
    const header = input.result?.header;
    if (header) {
      this.header = header;
      this.emit("has_header", header);
    } else if (this.header && input.params instanceof Array) {
      if (!this.state.receiving) {
        this.update("receiving", true);
      }
      const samples = [];
      for (const sample of input.params as (string | number)[][]) {
        const obj: { [index: string]: number } = {};
        for (const i in sample) {
          let val;
          switch (sample[i]) {
            case "inf":
              val = Infinity;
              break;
            case "-inf":
              val = Infinity;
              break;
            default:
              val = sample[i] as number;
          }

          obj[this.header[i]] = val;
        }
        const s = obj as any as Sample;
        if (this.base_time === undefined) {
          this.base_time = s.time;
          s.time = 0;
        } else {
          s.time = s.time - this.base_time;
        }
        samples.push(s);
      }
      this.emit("samples", samples);
    } else {
      console.log("Unknown message", input);
      this.disconnect();
    }
  }
}
