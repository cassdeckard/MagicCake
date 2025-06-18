import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef } from "react";

function Canvas() {
  const [bgEngineState, setBgEngineState] = useState({
    fullscreen: "true",
  });
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      setupEngine(canvasRef.current, bgEngineState);
    }
  }, [canvasRef, bgEngineState]);

  return (
    <>
          <canvas-overlay></canvas-overlay>
          <canvas ref={canvasRef} id="canvas"></canvas>
    </>
  );
}
export default function App() {
  return (<Canvas />);
}
