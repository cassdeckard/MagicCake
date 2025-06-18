import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef } from "react";

function Canvas() {
  const [bgEngineState, setBgEngineState] = useState({});
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      setupEngine(canvasRef.current, bgEngineState);
    }
  }, [canvasRef, bgEngineState]);

  return (
    <canvas ref={canvasRef} id="canvas" width="100%" height="100%"></canvas>
  );
}
export default function App() {
  return (<Canvas />);
}
