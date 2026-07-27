import {
  TITLE_SCREEN_CONFIG,
  TitleScreen,
} from "./Components/TitleScreen";
import { Game } from "./Game";

function App() {
  const backgroundColor = "";

  return (
    <main
      className="font-game relative min-h-[100dvh] overflow-hidden"
      style={{ backgroundColor }}
    >
      <Game backgroundColor={backgroundColor} />
      <TitleScreen config={TITLE_SCREEN_CONFIG} />
    </main>
  );
}

export default App;
