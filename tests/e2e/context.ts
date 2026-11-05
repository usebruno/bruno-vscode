type CollectionInfo = {
  name: string,
  location: string
}

// One per test: every collection the test creates, by name.
export class Context {
  private collections = new Map<string, CollectionInfo>();

  addCollection(name: string, location: string) {
    this.collections.set(name, { name, location });
  }

  collection(name: string): CollectionInfo {
    const collection = this.collections.get(name);

    if (!collection) {
      throw new Error(`Collection "${name}" was not created in this test`);
    }

    return collection;
  }
}
