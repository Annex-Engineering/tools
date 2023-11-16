// Based on d3axis plugin from TimeChart.
//
// Copyright (c) 2020 胡玮文
// Copyright (c) 2023 Lasse Dalegaard
import { axisBottom, axisLeft } from "d3-axis";
import { NumberValue } from "d3-scale";
import { select } from "d3-selection";
import core from "timechart/core/index";
import { TimeChartPlugin } from "timechart/plugins/index";

interface ChartAxisOptions {
  color: string;
}

function timeFormat(domain: NumberValue, index: number) {
  const v = domain.valueOf();
  let secs = v / 1000.0;
  let minutes = 0;
  if (secs >= 60) {
    minutes = Math.floor(secs / 60);
    secs -= minutes * 60;
  }
  let s = "" + secs.toFixed(3);
  if (minutes !== 0 && Math.floor(secs) < 10) {
    s = "0" + s;
  }
  if (minutes !== 0) {
    s = "" + minutes + ":" + s;
  }
  return s;
}

export class ChartAxis {
  constructor(
    chart: core,
    public readonly options: ChartAxisOptions,
  ) {
    this.apply(chart);
  }

  apply(chart: core) {
    const d3Svg = select(chart.svgLayer.svgNode)
      .append("g")
      .attr("stroke", this.options.color);
    const xg = d3Svg.append("g");
    const yg = d3Svg.append("g");

    const xAxis = axisBottom(chart.model.xScale).tickFormat(timeFormat);
    const yAxis = axisLeft(chart.model.yScale);

    function update() {
      const xs = chart.model.xScale;
      const xts = chart.options
        .xScaleType()
        .domain(xs.domain().map((d) => d + chart.options.baseTime))
        .range(xs.range());
      const ticks = ((xts as any).ticks() as number[]).filter((v) => v >= 0);
      xAxis.scale(xts).tickValues(ticks);
      xg.call(xAxis);

      yAxis.scale(chart.model.yScale);
      yg.call(yAxis);
    }

    chart.model.updated.on(update);

    chart.model.resized.on((w, h) => {
      const op = chart.options;
      xg.attr("transform", `translate(0, ${h - op.paddingBottom})`);
      yg.attr("transform", `translate(${op.paddingLeft}, 0)`);

      update();
    });
  }
}

const defaultOptions: ChartAxisOptions = {
  color: "#ffffff",
};

export class ChartAxisPlugin implements TimeChartPlugin<ChartAxis> {
  options: ChartAxisOptions;
  constructor(options?: Partial<ChartAxisOptions>) {
    if (!options) options = {};
    if (!defaultOptions.isPrototypeOf(options))
      Object.setPrototypeOf(options, defaultOptions);
    this.options = options as ChartAxisOptions;
  }

  apply(chart: core) {
    return new ChartAxis(chart, this.options);
  }
}
