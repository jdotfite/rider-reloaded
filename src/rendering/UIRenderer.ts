export class UIRenderer {
  private hud: HTMLElement;

  constructor() {
    this.hud = document.getElementById('hud')!;
  }

  update(frame: number, state: string) {
    this.hud.textContent = `${state} | frame: ${frame}`;
  }
}
