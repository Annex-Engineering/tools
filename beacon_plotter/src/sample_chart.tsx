import { faPlayCircle } from "@fortawesome/free-solid-svg-icons";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import Fa from "solid-fa";
import {
  Accessor,
  JSX,
  createSignal,
  onMount,
  onCleanup,
  createEffect,
  createMemo,
  Show,
  splitProps,
} from "solid-js";
import { render } from "solid-js/web";
import TimeChart from "timechart/core/index";
import { DataPointsBuffer } from "timechart/core/dataPointsBuffer";
import { crosshair } from "timechart/plugins/crosshair";
import { lineChart } from "timechart/plugins/lineChart";
import { nearestPoint } from "timechart/plugins/nearestPoint";
import { TimeChartTooltipPlugin } from "timechart/plugins/tooltip";
import { domainSearch } from "timechart/utils";
import { ChartAxisPlugin } from "./chart_axis";
import { BeaconStreamDumper, Sample } from "./stream_dumper";

export interface SampleChartProps {
  source: Accessor<BeaconStreamDumper>;
  set_highlighted_point?: (sample: Sample | undefined) => void;
}

export function SampleChart(
  props: JSX.HTMLAttributes<HTMLDivElement> & SampleChartProps,
) {
  let canvas: HTMLDivElement;

  interface DataPointSample {
    x: number;
    y: number;
    sample: Sample;
  }
  const data = new DataPointsBuffer<DataPointSample>();
  const [chart, set_chart] = createSignal<TimeChart>();
  const [xrange, set_xrange] = createSignal<{ min: number; max: number }>();

  let first_seen_at: Date | null = null;

  onMount(() => {
    const chart = new TimeChart(canvas, {
      color: "#fde047",
      renderPaddingLeft: 45,
      series: [{ data }],
      xRange: undefined,
      xScaleType: () => scaleLinear(),
      plugins: {
        lineChart,
        axis: new ChartAxisPlugin({ color: "#fde047" }),
        crosshair,
        nearestPoint,
        tooltip: new TimeChartTooltipPlugin({}),
      },
    });
    set_chart(chart);

    createResizeObserver(canvas, () => chart.onResize());

    let frame = requestAnimationFrame(loop);
    function loop(t: number) {
      frame = requestAnimationFrame(loop);

      const xr = xrange();
      if (xr) {
        chart.options.xRange = xr;
      } else {
        const elapsed = first_seen_at ? +new Date() - +first_seen_at : 0.0;
        const target = elapsed;
        chart.options.xRange = { min: target - 10000, max: target };
      }
    }

    onCleanup(() => {
      cancelAnimationFrame(frame);
      chart.dispose();
    });
  });

  createEffect(() => {
    const source = props.source();
    data.splice(0, data.length);

    const cb = (samples: Sample[]) => {
      for (const sample of samples) {
        let dist = sample.dist;
        // Assume a printer can't be  bigger than 1000 meters
        if (dist === Number.POSITIVE_INFINITY) {
          dist = 1000000.0;
        } else if (dist === Number.NEGATIVE_INFINITY) {
          dist = -1000000.0;
        }
        data.push({
          x: sample.time * 1000.0,
          y: dist,
          sample,
        });
      }

      if (data.length > 0) {
        if (first_seen_at === null) {
          const dt = data[data.length - 1].x - data[0].x;
          first_seen_at = new Date(+new Date() - dt);
        }
        //   const cutoff = data[data.length - 1].x - 10000;
        //   let cut = 0;
        //   while (cut < data.length && data[cut].x < cutoff) cut++;
        //   data.splice(0, cut);
      }

      chart()?.update();
    };
    source.on("samples", cb);
    onCleanup(() => source.off("samples", cb));
  });

  createEffect(() => {
    const c = chart();
    if (!c) return;
    c.options.yRange = { min: 0, max: 5.5 };
  });

  const on_wheel = (event: WheelEvent) => {
    event.preventDefault();

    const [min, max] = chart()!.model.xScale.domain();
    const dir = Math.sign(event.deltaY);

    if (!event.shiftKey) {
      // Scroll
      const amount = event.altKey ? 1 : 5;
      const shift = ((max - min) / 100.0) * dir * amount;
      set_xrange({ min: min + shift, max: max + shift });
    } else {
      // Zoom
      const point = chart()!.nearestPoint.dataPoints.values().next();
      if (point.done) return;
      const value = point.value;
      const diff = max - min;
      const amount = 1.1;
      const scale = dir > 0 ? amount : 1 / amount;
      const desired_diff = diff * scale;
      const dx = value.x - min;
      const desired_dx = dx * scale;
      set_xrange({
        min: value.x - desired_dx,
        max: value.x - desired_dx + desired_diff,
      });
    }
  };

  createEffect(() => {
    const c = chart()!;

    const [drag_start, set_drag_start] = createSignal<{
      x: number;
      y: number;
    }>();
    const [drag_end, set_drag_end] = createSignal<{
      x: number;
      y: number;
    }>();

    const drag_box = createMemo(() => {
      const from = drag_start();
      if (!from) return undefined;
      const to = drag_end();
      if (!to) return undefined;

      let fx = c.model.xScale.invert(from.x);
      let tx = c.model.xScale.invert(to.x);
      if (fx > tx) {
        let tmp = fx;
        fx = tx;
        tx = tmp;
      }
      let fy = c.model.yScale.invert(from.y);
      let ty = c.model.yScale.invert(to.y);
      if (fy > ty) {
        let tmp = fy;
        fy = ty;
        ty = tmp;
      }

      return { x: [fx, tx], y: [fy, ty] };
    });

    const rect = select(c.svgLayer.svgNode)
      .append("rect")
      .attr("stroke", "#fb923c")
      .attr("fill", "none");
    createEffect(() => {
      const box = drag_box();
      if (!box) {
        rect.attr("visibility", "hidden");
        return;
      }
      const { xScale, yScale } = c.model;
      rect
        .attr("visibility", "")
        .attr("x", xScale(box.x[0]))
        .attr("y", yScale(box.y[1]))
        .attr("width", xScale(box.x[1]) - xScale(box.x[0]))
        .attr("height", yScale(box.y[0]) - yScale(box.y[1]));
    });

    const detector = c.contentBoxDetector;
    const coord = (ev: MouseEvent) => {
      return {
        x: ev.clientX,
        y: ev.clientY,
      };
    };
    detector.node.addEventListener("mousedown", (ev) => {
      if (!ev.ctrlKey) return;
      const [min, max] = c.model.xScale.domain();
      set_xrange({ min, max });
      set_drag_start(coord(ev));
      set_drag_end(undefined);
    });
    detector.node.addEventListener("mousemove", (ev) => {
      if (!drag_start()) return;
      set_drag_end(coord(ev));
    });

    detector.node.addEventListener("mouseup", (ev) => {
      const box = drag_box();
      set_drag_start(undefined);
      if (!box) return;

      set_xrange({
        min: box.x[0],
        max: box.x[1],
      });
      c.options.yRange = { min: box.y[0], max: box.y[1] };
    });
  });

  createEffect(() => {
    const shp = props.set_highlighted_point;
    if (!shp) return;
    const c = chart()!;
    const detector = c.contentBoxDetector;

    c.nearestPoint.updated.on(() => {
      const point = chart()!.nearestPoint.dataPoints.values().next();
      if (point.done) return;
      const value = point.value;
      const dpoint = c.model.pxPoint(value);
      const ppoint = c.nearestPoint.lastPointerPos!;
      const dx = dpoint.x - ppoint.x;
      const dy = dpoint.y - ppoint.y;
      const dist = dx * dx + dy * dy;
      if (dist < 25) {
        const idx = domainSearch(data, 0, data.length, value.x, (d) => d.x);
        if (idx < 0 || idx >= data.length) {
          return shp(undefined);
        }
        shp(data[idx].sample);
      } else {
        shp(undefined);
      }
    });
  });

  createEffect(() => {
    const c = chart()!;
    const container = document.createElement("div");

    const on_click = () => {
      set_xrange(undefined);
    };

    const Icon = () => {
      return (
        <Show when={xrange()}>
          <button
            onClick={on_click}
            style={{
              "background-image": "none",
              "background-color": "transparent",
              padding: "0",
              margin: "10px",
              cursor: "pointer",
              border: "0",
              right: "0",
              position: "absolute",
            }}
            title="Follow live data"
          >
            <Fa icon={faPlayCircle} color="#38bdf880" size="2x" />
          </button>
        </Show>
      );
    };
    render(() => <Icon />, container);

    c.el.shadowRoot!.appendChild(container);
    onCleanup(() => c.el.shadowRoot!.removeChild(container));
  });

  const div = splitProps(props, ["set_highlighted_point"])[1];
  return <div {...div} ref={canvas!} onWheel={on_wheel}></div>;
}
