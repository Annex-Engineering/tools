import {
  Accessor,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  For,
  ValidComponent,
  createMemo,
  Switch,
  Match,
} from "solid-js";
import { createStore } from "solid-js/store";
import { Fa } from "solid-fa";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import "./App.css";
import { Dynamic } from "solid-js/web";
import { BeaconStreamDumper, Sample } from "./stream_dumper";
import { SampleChart } from "./sample_chart";

const precision_rounder = (d: number) => {
  return (v: number) => {
    return v.toFixed(d);
  };
};
const rp1 = precision_rounder(1);
const rp2 = precision_rounder(2);
const rp3 = precision_rounder(3);
const rp4 = precision_rounder(4);

interface DataFieldProps {
  last_sample: Accessor<Sample>;
}

const DataFields: [string, ValidComponent][] = [
  ["Dist", (props: DataFieldProps) => <>{rp4(props.last_sample().dist)}</>],
  ["Freq", (props: DataFieldProps) => <>{rp3(props.last_sample().dist)}</>],
  [
    "Pos",
    (props: DataFieldProps) => (
      <Show
        when={props.last_sample().pos}
        fallback={<span class="text-yellow-800">-</span>}
      >
        {props.last_sample().pos!.map(rp2).join(",") || "-"}
      </Show>
    ),
  ],
  ["Temp", (props: DataFieldProps) => <>{rp1(props.last_sample().temp)}</>],
  ["Time", (props: DataFieldProps) => <>{rp3(props.last_sample().time)}</>],
  [
    "Vel",
    (props: DataFieldProps) => {
      const vel = createMemo(() => {
        const vel = props.last_sample()?.vel;
        return vel ? rp2(vel) : undefined;
      });
      return (
        <Show
          when={vel() != undefined}
          fallback={<span class="text-yellow-800">-</span>}
        >
          {vel()!}
        </Show>
      );
    },
  ],
];

function App() {
  const [last_sample, set_last_sample] = createSignal<Sample>();

  const saved_settings = localStorage.getItem("settings");
  let init_settings = {
    domain: "",
    port: 80,
    secure: false,
  };
  if (saved_settings) {
    init_settings = { ...init_settings, ...JSON.parse(saved_settings) };
  }
  const [settings, set_settings] = createStore(init_settings);

  createEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  });

  const source_url = createMemo(() => {
    if (!settings.domain || !settings.port) return undefined;
    return `ws${settings.secure ? "s" : ""}://${settings.domain}:${
      settings.port
    }/klippysocket`;
  });

  const [raw_source, set_raw_source] = createSignal<BeaconStreamDumper>();
  const connect = () => {
    const url = source_url();
    if (url) {
      set_raw_source(new BeaconStreamDumper(url));
    }
  };

  const source = createMemo(() => {
    const src = raw_source();
    if (!src || !src.state.receiving) return undefined;
    return src;
  });

  createEffect(() => {
    const sd = source();
    if (!sd) return;
    const cb = (samples: Sample[]) => {
      if (samples.length) {
        set_last_sample(samples[samples.length - 1]);
      }
    };
    sd.addListener("samples", cb);
    onCleanup(() => sd.removeListener("samples", cb));
  });

  const [highlighted_point, set_highlighted_point] = createSignal<
    Sample | undefined
  >();

  return (
    <Switch>
      <Match when={!source()}>
        <div class="absolute inset-0 flex flex-col justify-center bg-slate-950 text-black">
          <div class="mx-auto container max-w-screen-sm bg-gray-300 rounded-lg p-4">
            <Show
              when={!raw_source()?.state.connected}
              fallback={
                <h1 class="text-lg font-bold">Awaiting initial data</h1>
              }
            >
              <h1 class="text-xl font-bold mb-3">Connection details</h1>
              <div class="mb-3">
                <label
                  class="block mb-2 text-sm font-medium text-gray-900"
                  for="ip"
                >
                  Moonraker IP address or domain
                </label>
                <input
                  class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  type="ip"
                  id="ip"
                  value={settings.domain}
                  onInput={(e) => set_settings("domain", e.currentTarget.value)}
                />
              </div>
              <div class="mb-3">
                <label
                  class="block mb-2 text-sm font-medium text-gray-900"
                  for="ip"
                >
                  Moonraker port
                </label>
                <input
                  class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  type="ip"
                  id="ip"
                  value={settings.port}
                  onInput={[set_settings, "port"]}
                />
              </div>
              <div class="flex flex-row items-center gap-3">
                <button
                  type="button"
                  classList={{
                    "text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center w-max":
                      true,
                    "bg-gray-700": !source_url(),
                  }}
                  onClick={connect}
                  disabled={raw_source()?.state.connecting || !source_url()}
                >
                  <Show when={raw_source()?.state.connecting}>
                    <Fa
                      icon={faGear}
                      spin={true}
                      classList={{ "inline-block": true, "mr-2": true }}
                    />
                  </Show>
                  Connect
                </button>
                <Show when={raw_source()?.state.last_error}>
                  {(error) => (
                    <div class="text-red-600 font-bold">
                      Connection error: {error()}
                    </div>
                  )}
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </Match>
      <Match when={source()}>
        {(source) => (
          <div class="absolute inset-0 flex flex-col bg-slate-950 text-yellow-300">
            <SampleChart
              class="grow"
              set_highlighted_point={set_highlighted_point}
              source={source}
            />
            <Show when={highlighted_point() || last_sample()}>
              {(last_sample) => (
                <div>
                  <div
                    class="text-xs font-extrabold bg-slate-950 w-max mx-2"
                    style={{ "margin-bottom": "-8px" }}
                  >
                    <Show when={highlighted_point()} fallback={"Last sample"}>
                      Sample under cursor
                    </Show>
                  </div>
                  <div class="grid grid-cols-6 px-2 pt-3 border-t border-slate-600">
                    <For each={DataFields}>
                      {([title, formatter]) => (
                        <div class="flex-col odd:bg-slate-900 px-2">
                          <div class="font-extrabold text-sm">{title}</div>
                          <div>
                            <Dynamic
                              component={formatter}
                              last_sample={last_sample}
                            />
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  );
}

export default App;
