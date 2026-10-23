export class Context {
  private _collectionLocation = '';

  collectionName = '';


  constructor(collectionName?: string) {
    this.collectionName = collectionName;
  }

  get collectionLocation() {
    return this._collectionLocation;
  }

  set collectionLocation(loc) {
    this._collectionLocation = loc;
  }
}