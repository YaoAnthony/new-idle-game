import { gameBus } from '../../shared/EventBus';

export class BuildingInteractionSystem {
  constructor(private readonly scene: any) {}

  openPanel(buildingId: string): void {
    gameBus.emit('building:panel_open_requested', {
      buildingId,
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
    });
  }
}
