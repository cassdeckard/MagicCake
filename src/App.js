import Canvas from "./components/Canvas";
import GithubCorner from "react-github-corner";
export default function App() {
  return (
    <>
      <Canvas />
      <GithubCorner href="https://github.com/cassdeckard/MagicCake" size={160} direction="left" />
    </>
  );
}
