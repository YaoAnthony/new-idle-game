import {
  TITLE_SCREEN_CONFIG,
  TitleScreen,
} from "./Components/TitleScreen";
import { Game } from "./Game";

function App() {
  const backgroundColor = TITLE_SCREEN_CONFIG.presentation.backgroundColor;

  return (
    <main
      className="font-game relative h-[100dvh] min-h-0 overflow-hidden"
      style={{ backgroundColor }}
    >
      <Game backgroundColor={backgroundColor} />
      <TitleScreen config={TITLE_SCREEN_CONFIG} />
    </main>
  );
}

export default App;
