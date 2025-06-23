import { useState, useCallback } from "react";

import Canvas from "./components/Canvas";
import GithubCorner from "react-github-corner";

export default function App() {
  var [hideHud, setHideHud] = useState(false);

  const toggleHideHud = useCallback(() => {
    setHideHud(!hideHud);
  }, [hideHud, setHideHud]);

  return (
    <>
      <Canvas hideHud={hideHud} toggleHideHud={toggleHideHud}/>
      <GithubCorner href="https://github.com/cassdeckard/MagicCake" size={160} direction="left" hidden={hideHud} />
    </>
  );
}
