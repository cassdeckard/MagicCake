import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef } from "react";

function Canvas() {
  const [bgEngineState] = useState({});
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      setupEngine(canvasRef.current, bgEngineState);
    }
  }, [canvasRef, bgEngineState]);

  return (
    <>
          <div id="overlay">test overlay</div>
          <canvas ref={canvasRef} id="canvas" className="full"></canvas>
    </>
  );
}
export default function App() {
  return (<Canvas />);
}
