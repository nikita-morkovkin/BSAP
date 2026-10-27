import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import type { GreetingAnalysis } from '@/types/greeting-analysis.type';

type GreetingWaveformProps = { projectId: string; revision: string };

const GreetingWaveform = ({ projectId, revision }: GreetingWaveformProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<GreetingAnalysis | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiClient.greeting.analyze(projectId, controller.signal).then(setAnalysis).catch(() => {
        if (!controller.signal.aborted) {
          setError('Generate greeting audio to view speech activity.');
        }
      });
    }, 350);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, revision]);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');

    if (!context || !analysis) {
      return;
    }

    const width = 800;
    const height = 100;
    const duration = analysis.endSec - analysis.startSec;

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#164e63';

    for (const segment of analysis.segments) {
      if (segment.speaking) {
        context.fillRect(segment.start / duration * width, 0, (segment.end - segment.start) / duration * width, height);
      }
    }

    context.strokeStyle = '#67e8f9';
    context.beginPath();

    for (const [index, peak] of analysis.peaks.entries()) {
      const x = index / analysis.peaks.length * width;

      context.moveTo(x, height / 2 - peak * 45);
      context.lineTo(x, height / 2 + peak * 45);
    }

    context.stroke();
  }, [analysis]);

  const cut = analysis ? Math.ceil((analysis.endSec + 1.5 + 0.8) / 2) * 2 : 0;

  return <div><canvas ref={canvas} width={800} height={100} className="w-full rounded bg-slate-950" aria-label="Greeting waveform and speech activity" />{analysis ? <p className="text-xs">Voice: {analysis.startSec.toFixed(2)}–{analysis.endSec.toFixed(2)} s. Approximate GOP cut: {cut}s (placement and fades may extend this).</p> : <p className="text-xs">{error}</p>}</div>;
};

export default GreetingWaveform;