class BrunoClipboard {
  items: any;
  constructor() {
    this.items = [];
  }

  write(item: any) {
    this.items = [item];
  }

  read() {
    return {
      items: this.items,
      hasData: this.items.length > 0
    };
  }
}

const brunoClipboard = new BrunoClipboard();

export default brunoClipboard;
