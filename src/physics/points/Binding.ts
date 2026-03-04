export class Binding {
  riderMounted: boolean = true;
  sledIntact: boolean = true;

  breakSled() {
    this.sledIntact = false;
    this.riderMounted = false;
  }

  dismount() {
    this.riderMounted = false;
  }

  reset() {
    this.riderMounted = true;
    this.sledIntact = true;
  }
}
