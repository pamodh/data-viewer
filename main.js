const CONTENT_STORE_INFO = { name: "contentStore", options: { keyPath: "id" } };
const CONTENT_INDEX_INFO = { name: "titleIndex", keyPath: "title_lower", options: { unique: true } };
const METADATA_DATABASE_INFO = { name: "metadataDB", version: 1 }
const METADATA_STORE_INFO = { name: "metadataStore", options: { keyPath: "name" } };
const METADATA_INDEX_INFO = { name: "nameIndex", keyPath: "name", options: { unique: true } };

function setVisible(elem, visible) {
    elem.classList.remove("hidden");
    if (! visible) {
        elem.classList.add("hidden");
    }
}

function setStatusMessage(message) {
    document.getElementById("status-text").textContent = message;
}

function switchActivity(activity) {
    if (activity === "search") {
        setVisible(document.getElementById("search-panel"), true);
        setVisible(document.getElementById("load-data-panel"), true);
        setVisible(document.getElementById("results-panel"), true);
        setVisible(document.getElementById("info-panel"), false);
        document.getElementById("search-fieldset").disabled = false;
        document.getElementById("load-data-fieldset").disabled = false;
        setVisible(document.getElementById("status-panel"), false);
    } else if (activity === "item") {
        setVisible(document.getElementById("search-panel"), false);
        setVisible(document.getElementById("load-data-panel"), false);
        setVisible(document.getElementById("results-panel"), false);
        setVisible(document.getElementById("info-panel"), true);
    } else if (activity == "loading") {
        document.getElementById("search-fieldset").disabled = true;
        document.getElementById("load-data-fieldset").disabled = true;
        setVisible(document.getElementById("results-panel"), false);
        setVisible(document.getElementById("status-panel"), true);
    }
}

function updateDatastoreInterface() {
    const body = document.body;
    const select = document.getElementById("datastore-name");
    const selectedTheme = "theme" + (select.selectedIndex + 1);
    for (let i = 1; i <= select.length; i++) {
        let thisTheme = "theme" + i;
        if (body.classList.contains(thisTheme)) {
            body.classList.replace(thisTheme, selectedTheme);
        }
    }
    body.classList.add(selectedTheme);
    if (select.selectedOptions.length) {
        document.title = select.selectedOptions[0].text + " Viewer";
    } else {
        document.title = document.head.title; // Use original title
    }
}

function renderSection(section) {
    let sectionElem = document.createElement("details");
    let titleElem = document.createElement("summary");
    let infoElem = document.createElement("div");
    console.info("Rendering section:");
    console.info(section);
    sectionElem.classList.add("item-section");
    titleElem.textContent = section.name;
    titleElem.classList.add("item-section-name");
    infoElem.innerHTML = section.content;
    infoElem.classList.add("item-section-content");
    sectionElem.append(titleElem, infoElem);
    return sectionElem;
}

function showResultInfo(result) {
    document.getElementById("info-title").textContent = result.title;
    let children = [];
    for (let i = 0; i < result.sections.length; i++) {
        children.push(renderSection(result.sections[i]));
    }
    let sectionParentElem = document.getElementById("info-sections");
    sectionParentElem.replaceChildren(...children);
    switchActivity("item");
}

function initDatabase(dbInfo, storeInfo, indexInfo) {
    // database = { name: "", version: 1 }
    // store = { name: "", options: {} }
    // index = { name: "", keyPath: "", options: {} }
    // Returns a promise

    return new Promise((resolve, reject) => {
        console.info("Initializing database", dbInfo, "with store", storeInfo, "and index", indexInfo);
        const openRequest = indexedDB.open(dbInfo.name, dbInfo.version ?? 1);
        openRequest.onupgradeneeded = e => {
            console.info("Upgrading previous database from", e.oldVersion, "to", e.newVersion);
            const db = e.target.result;
            try {
                db.deleteObjectStore(storeInfo.name);
                console.info("Deleted datastore", storeInfo.name);
            } catch (ex) {
                if (ex instanceof DOMException && ex.name == "NotFoundError") {
                    console.info("No previous datastore found for", storeInfo.name);
                } else {
                    alert("Error initializing database!");
                    console.error("`Error deleting IndexedDB datastore", storeInfo.name, ex);
                }
            }
            console.info("Creating store", storeInfo);
            const store = db.createObjectStore(storeInfo.name, storeInfo.options);
            if (indexInfo) {
                console.info("Creating index", indexInfo);
                store.createIndex(indexInfo.name, indexInfo.keyPath, indexInfo.options);
            }
        };
        openRequest.onsuccess = e => {
            resolve(e.target.result);
        };
        openRequest.onerror = e => {
            reject(e);
        };
    });
}

function deleteDatabase(dbName) {
    return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = e => {
            console.info("Deleted database", dbName);
            resolve(null);
        };
        deleteRequest.onerror = e => reject(e);
    });
}

function executeDatabaseRead(db, storeName, indexName) {
    return new Promise((resolve, reject) => {
        console.info("Read query started for database", db, "store", storeName, "index", indexName);
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const cursorRequest = index.openCursor();
        const results = [];
        cursorRequest.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else { // i.e. end of results
                console.info("Read query completed with", results.length, "items for database", db, "store", storeName, "index", indexName);
                db.close();
                resolve(results);
            }
        };
        cursorRequest.onerror = e => {
            reject(e);
        };
    });
}

function populateResults(results) {
    let children = []
    results.forEach(result => {
        let c1 = document.createElement("li");
        let c2 = document.createElement("a");
        c1.appendChild(c2);
        c2.textContent = result.title;
        c2.href = "#";
        c2.addEventListener("click", (e) => {
            e.preventDefault();
            showResultInfo(result);
        });
        children.push(c1);
    });
    if (! children.length) {
        let c = document.createElement("li");
        c.textContent = "No results match search term";
        children.push(c);
    }
    let listParentElem = document.getElementById("results-list");
    listParentElem.replaceChildren(...children);
    switchActivity("search");
}

function searchTitles() {
    const searchText = document.getElementById("search-text").value.trim().toLowerCase();
    const dbName = document.getElementById("datastore-name").value;
    if (!dbName) {
        console.warn("Search function called with no database selected");
        return;
    }
    setStatusMessage("Loading data...")
    switchActivity("loading");
    initDatabase({ name: dbName, version: 1 }, CONTENT_STORE_INFO, CONTENT_INDEX_INFO)
        .then(db => executeDatabaseRead(db, CONTENT_STORE_INFO.name, CONTENT_INDEX_INFO.name))
        .then(results => results.filter(item => item.title_lower.indexOf(searchText) >= 0))
        .then(results => populateResults(results))
        .catch(ex => {
            console.error("IndexedDB error in loading search results", ex);
            alert("Error loading data");
            switchActivity("search");
        });
}

function populateDatastoreNames(results) {
    const selectElem = document.getElementById("datastore-name");
    while (selectElem.options.length > 0) {
        selectElem.remove(0);
    }
    results.forEach(result => {
        let opt = document.createElement("option");
        opt.value = result.name;
        opt.text = result.description;
        selectElem.add(opt);
    });
    if (results.length) {
        selectElem.selectedIndex = 0;
    } else {
        alert("No data loaded! Please load some data to initialise the viewer.");
    }
    updateDatastoreInterface();
    searchTitles();
}

function loadDatastoreNames() {
    setStatusMessage("Loading data...")
    switchActivity("loading");
    initDatabase(METADATA_DATABASE_INFO, METADATA_STORE_INFO, METADATA_INDEX_INFO)
        .then(db => executeDatabaseRead(db, METADATA_STORE_INFO.name, METADATA_INDEX_INFO.name))
        .then(results => populateDatastoreNames(results))
        .catch(ex => {
            console.error("IndexedDB error in loading datastore names", ex);
            alert("Error loading data");
            switchActivity("search");
        });
}

function saveDataToIDB(data) {
    setStatusMessage("Saving data into database...");
    switchActivity("loading");
    console.info("Saving new data to database", METADATA_DATABASE_INFO);
    initDatabase(METADATA_DATABASE_INFO, METADATA_STORE_INFO, METADATA_INDEX_INFO)
        .then(db => {
            console.info("Creating write transaction to metadata database");
            const tx = db.transaction(METADATA_STORE_INFO.name, "readwrite");
            const store = tx.objectStore(METADATA_STORE_INFO.name);
            store.put(data.metadata);
            return new Promise((resolve, reject) => {
                tx.oncomplete = e => resolve(db);
                tx.onerror = e => reject(e);
            });
        })
        .then(db => {
            console.info("Write transaction completed for metadata store");
            db.close();
        })
        .catch(ex => {
            console.error("IndexedDB error in saving to metadata database", ex);
            alert("Error saving data");
            switchActivity("search");
        });
    const contentDBName = data.metadata.name;
    deleteDatabase(contentDBName)
        .then(_ => initDatabase({ name: contentDBName, version: 1}, CONTENT_STORE_INFO, CONTENT_INDEX_INFO))
        .then(db => {
            console.info("Creating write transaction to content store", CONTENT_STORE_INFO);
            const tx = db.transaction(CONTENT_STORE_INFO.name, "readwrite");
            const store = tx.objectStore(CONTENT_STORE_INFO.name);
            for (let i = 0; i < data.items.length; i++) {
                data.items[i].title_lower = data.items[i].title.toLowerCase();
                store.add(data.items[i]);
                setStatusMessage("Processed item " + (i + 1) + " of " + data.items.length);
            }
            console.info("Transaction configured to add", data.items.length, "items");
            return new Promise((resolve, reject) => {
                tx.oncomplete = e => resolve(db);
                tx.onerror = e => reject(e);
            });
        })
        .then(db => {
            console.info("Write transaction completed for content store", CONTENT_STORE_INFO);
            db.close();
            loadDatastoreNames();
            alert("Data saved succesfully!");
        })
        .catch(ex => {
            console.error("IndexedDB error in saving content data", ex);
            alert("Error saving data");
            switchActivity("search");
        });
}

function saveData() {
    const fileElement = document.getElementById("data-file");
    if (fileElement.files.length > 0) {
        setStatusMessage("Reading file...");
        switchActivity("loading");
        let file = fileElement.files[0];
        let reader = new FileReader();
        reader.addEventListener("load", (e) => {
            let text = e.target.result;
            let data = JSON.parse(text)
            saveDataToIDB(data);
        });
        reader.readAsText(file);
    } else {
        alert("Please select a JSON file!");
    }
}

function onDocumentLoad() {
    document.getElementById("load-data-form").addEventListener("submit", (e) => {
        e.preventDefault();
        saveData();
    });
    document.getElementById("search-form").addEventListener("submit", (e) => {
        e.preventDefault();
        searchTitles();
    });
    document.getElementById("search-form").addEventListener("reset", (e) => {
        document.getElementById("search-text").value = "";
        searchTitles();
    });
    document.getElementById("back-button").addEventListener("click", (e) => {
        switchActivity("search");
    });
    document.getElementById("datastore-name").addEventListener("change", (e) => {
        updateDatastoreInterface();
        document.getElementById("search-form").reset();
    });
    loadDatastoreNames();
    switchActivity("search");
}

window.addEventListener("load", (e) => onDocumentLoad());