import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposedChart, Line, YAxis, ReferenceArea, ReferenceLine } from "recharts";

const STEP_MS = 3 * 60 * 1000;
const rows = 3420;
const newestIndex = 3360;
const data = [];
for (let i = 0; i < rows; i++) {
  const row = { time: i * STEP_MS, bg: 400 };
  if (i <= newestIndex) {
    row.glucose = 150;
    row.glucose_seg_0 = 150;
  }
  data.push(row);
}

const chartWidth = 10000;
const target = data[newestIndex].time;
const render = (props) => {
  if (props.payload?.time !== target) return null;
  return <circle cx={props.cx} cy={props.cy} r={3.6} data-marker="yes" />;
};

const html = renderToStaticMarkup(
  <ComposedChart
    width={chartWidth}
    height={234}
    data={data}
    margin={{ top: 22, right: 0, left: -20, bottom: 0 }}
  >
    <ReferenceArea yAxisId="glucose" x1={target} x2={data[rows - 1].time} fill="#af751b" fillOpacity={0.06} stroke="none" />
    <YAxis yAxisId="glucose" domain={[40, 250]} allowDataOverflow hide />
    <ReferenceArea yAxisId="glucose" y1={70} y2={180} fill="#8fa68c" fillOpacity={0.14} stroke="none" />
    <ReferenceLine yAxisId="glucose" y={180} stroke="#5f8460" strokeWidth={1} />
    <Line
      yAxisId="glucose"
      type="monotoneX"
      dataKey="glucose_seg_0"
      stroke="#8c4a28"
      strokeWidth={2.75}
      dot={render}
      activeDot={false}
      connectNulls
      isAnimationActive={false}
    />
  </ComposedChart>
);

const marker = html.match(/data-marker="yes"[^>]*/);
console.log("marker present:", Boolean(marker), marker?.[0]);
const clips = html.match(/<clipPath[^>]*>.*?<\/clipPath>/g);
console.log("clips:", clips);
const dotsLayerClip = html.match(/recharts-line-dots[^>]*/);
console.log("dots layer:", dotsLayerClip?.[0]);
const svgTag = html.match(/<svg[^>]*>/);
console.log("svg:", svgTag?.[0]);