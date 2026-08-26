import {FC, useMemo} from 'react';
import {StyleSheet} from 'react-native';
import {PieChart, PieChartData} from 'react-native-svg-charts';
import {View} from 'react-native-ui-lib';
import {Circle, G, Line, Text} from 'react-native-svg';

const styles = StyleSheet.create({
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pie: {
    width: '100%',
    height: '100%',
  },
});

interface Slice {
  labelCentroid: [number, number];
  pieCentroid: [number, number];
  data: PieChartData;
}

interface UsagePieLabelsProps {
  slices?: Slice[];
}

const UsagePieLabels: FC<UsagePieLabelsProps> = ({slices}) => (
  <>
    {slices
      ?.filter(slice => slice.data.key !== '_free')
      .map((slice, index) => {
        const {labelCentroid, pieCentroid, data: sliceData} = slice;
        const [centroidX, centroidY] = labelCentroid;
        let alignment: 'start' | 'end' | 'middle' = 'middle';
        let dx = 0;
        let dy = 0;

        if (centroidX > 0 && centroidY < 0) {
          alignment = 'start';
          dx = 10;
        } else if (centroidX < 0 && centroidY < 0) {
          alignment = 'end';
          dx = -10;
        } else if (centroidX < 0 && centroidY > 0) {
          dy = 10;
        } else if (centroidX > 0 && centroidY > 0) {
          alignment = 'start';
          dx = 10;
        }

        return (
          <G key={index}>
            <Line
              x1={labelCentroid[0]}
              y1={labelCentroid[1]}
              x2={pieCentroid[0]}
              y2={pieCentroid[1]}
              stroke={sliceData.svg?.fill}
            />
            <Text
              fill={sliceData.svg?.fill}
              alignmentBaseline="middle"
              x={centroidX}
              y={centroidY}
              dx={dx}
              dy={dy}
              textAnchor={alignment}
            >
              {sliceData.key}
            </Text>
            <Circle
              cx={labelCentroid[0]}
              cy={labelCentroid[1]}
              r={3}
              fill={sliceData.svg?.fill}
            />
          </G>
        );
      })}
  </>
);

export interface UsagePieChartData {
  label: string;
  value: number;
  color: string;
}

interface IUsagePieChartProps {
  chartData: UsagePieChartData[];
  height: number;
}

export const UsagePieChart: FC<IUsagePieChartProps> = ({chartData, height}) => {
  const data: PieChartData[] = useMemo(
    () => [
      ...chartData.map(({label, value, color}) => ({
        key: label,
        value,
        svg: {fill: color},
        arc: {outerRadius: '110%', cornerRadius: 5},
      })),
      {
        key: '_free',
        value: 100 - chartData.reduce((sum, datum) => sum + datum.value, 0),
        svg: {fill: '#ddd'},
        arc: {cornerRadius: 5},
      },
    ],
    [chartData],
  );

  return (
    <View style={[styles.wrapper, {height}]}>
      <PieChart
        data={data}
        innerRadius={10}
        outerRadius={80}
        labelRadius={110}
        style={styles.pie}
      >
        <UsagePieLabels />
      </PieChart>
    </View>
  );
};
