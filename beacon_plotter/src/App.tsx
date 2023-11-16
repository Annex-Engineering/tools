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
  JSX,
} from "solid-js";
import { createStore } from "solid-js/store";
import { Fa } from "solid-fa";
import {
  faCircleInfo,
  faClose,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
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

const CodeSpan = (props: { children: JSX.Element }) => (
  <span class="font-mono font-semibold">{props.children}</span>
);

const SetupText = () => {
  const config = [
    "[authorization]",
    "cors_domains:",
    `    ...`,
    `    ${window.location.protocol}//${window.location.host}   # Add this line`,
  ].join("\n");

  return (
    <div class="text-sm">
      <p class="mb-1">
        This tool provides a Beacon "oscilloscope" to view real time samples
        received from the sensor.
      </p>
      <p class="mb-2">
        The tool connects to Beacon via Moonraker. To be able to connect, you
        must put the following under the{" "}
        <CodeSpan>authorization.cors_domains</CodeSpan> option in your{" "}
        <CodeSpan>moonraker.conf</CodeSpan> config file.
      </p>
      <pre class="bg-slate-800 text-gray-300 p-1 rounded">
        <code>{config}</code>
      </pre>
    </div>
  );
};

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

  const [show_help, set_show_help] = createSignal(false);
  const [highlighted_point, set_highlighted_point] = createSignal<
    Sample | undefined
  >();

  return (
    <>
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
                  <SetupText />
                </div>
                <div class="mb-3">
                  <label
                    class="block mb-2 text-sm font-medium text-gray-900"
                    for="ip"
                  >
                    Moonraker IP address or domain:
                  </label>
                  <input
                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    id="ip"
                    value={settings.domain}
                    onInput={(e) =>
                      set_settings("domain", e.currentTarget.value)
                    }
                  />
                </div>
                <div class="mb-3">
                  <label
                    class="block mb-2 text-sm font-medium text-gray-900"
                    for="ip"
                  >
                    Moonraker port:
                  </label>
                  <input
                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    id="ip"
                    value={settings.port}
                    onInput={(e) =>
                      set_settings(
                        "port",
                        parseInt(e.currentTarget.value) || 80,
                      )
                    }
                  />
                </div>
                <div class="mb-3 flex flex-row items-center">
                  <label
                    class="block text-sm font-medium text-gray-900"
                    for="ip"
                  >
                    Secure connection:
                  </label>
                  <input
                    class="w-4 h-4 ml-2 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2"
                    type="checkbox"
                    id="ip"
                    onInput={(e) =>
                      set_settings("secure", e.currentTarget.checked)
                    }
                    checked={settings.secure}
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
                  <div class="w-full">
                    <div
                      class="text-xs font-extrabold bg-slate-950 w-full flex flex-row justify-between px-2 items-center"
                      style={{ "margin-bottom": "-8px" }}
                    >
                      <div>
                        <Show
                          when={highlighted_point()}
                          fallback={"Last sample"}
                        >
                          Sample under cursor
                        </Show>
                      </div>
                      <button onClick={() => set_show_help(true)}>
                        <Fa icon={faCircleInfo} />
                      </button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 px-2 pt-3 border-t border-slate-600">
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
      <Show when={show_help()}>
        <div class="absolute inset-0 flex flex-col justify-center text-black">
          <div class="mx-auto container max-w-screen-sm bg-gray-300 rounded-lg p-4">
            <div class="flex flex-row">
              <h1 class="text-xl font-bold mb-3 grow">Help</h1>
              <button class="border-0" onClick={() => set_show_help(false)}>
                <Fa icon={faClose} />
              </button>
            </div>
            <div>
              <p class="mb-2">
                The interface shows the distance measured by Beacon on the{" "}
                <CodeSpan>y</CodeSpan> axis, as a function of time shown on the{" "}
                <CodeSpan>x</CodeSpan> axis.
              </p>
              <p class="mb-2">
                The bottom bar shows the last received sample. When hovering
                over the graph, the sample under the cursor will be shown
                instead.
              </p>
              <p class="mb-2">The following interactions are available:</p>
              <table>
                <tbody>
                  <tr>
                    <td class="font-bold">Zoom to selection</td>
                    <td>Ctrl-click and drag on the graph</td>
                  </tr>
                  <tr>
                    <td class="font-bold">Zoom around point</td>
                    <td>
                      Hover over a point in the graph, hold Ctrl, and use the
                      scroll wheel to zoom
                    </td>
                  </tr>
                  <tr>
                    <td class="font-bold">Pan</td>
                    <td>Use the scroll wheel to go forward and back in time</td>
                  </tr>
                  <tr>
                    <td class="font-bold">Reset Y axis</td>
                    <td>Right click on the graph</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}

export default App;
