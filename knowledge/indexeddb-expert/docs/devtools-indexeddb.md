# Chrome DevTools: IndexedDB

Sources: https://developer.chrome.com/docs/devtools/storage/indexeddb · https://developer.chrome.com/docs/devtools/application · https://developer.chrome.com/blog/new-in-devtools-88

- Application tab → expand **IndexedDB** → click a database to see its **origin and version** → click an object store to see key-value pairs (**Total entries**, **Key generator value**) → click an index to sort by it → click a Value cell to expand it.
- Data doesn't update live: click **Refresh** or **Refresh database**.
- Delete a row: select it (it turns blue) → `Delete` key or **Delete Selected**. **Clear object store**. **Delete database**.
- Clear everything: **Storage** pane → keep **IndexedDB** checked → **Clear site data**.
- Storage pane: usage pie chart and **Simulate custom storage quota** (Chrome 88+).
