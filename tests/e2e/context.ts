import type { FileFormat } from './utils/page/sidebar';

type CollectionInfo = {
  name: string,
  location: string,
  format: FileFormat,
}

// One per test: every collection the test creates, by name.
export class Context {
  private _collections = new Map<string, CollectionInfo>();

  get collections(): string[] {
    return Array.from(this._collections.keys());
  }

  addCollection(name: string, location: string, format: FileFormat) {
    this._collections.set(name, { name, location, format });
  }

  getCollection(name: string): CollectionInfo {
    const collection = this._collections.get(name);

    if (!collection) {
      throw new Error(`Collection "${name}" was not created in this test`);
    }

    return collection;
  }
}
