function setVisible(elem, visible) {
    elem.classList.remove("hidden");
    if (! visible) {
        elem.classList.add("hidden");
    }
}

function setStatusMessage(message) {
    document.getElementById("status-text").textContent = message;
    console.info(message);
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
    setStatusMessage("Loading data...")
    switchActivity("loading");
    const searchText = document.getElementById("search-text").value.toLowerCase();
    const openRequest = indexedDB.open("viewerDB");
    openRequest.onsuccess = (e1) => {
        const db = e1.target.result;
        const tx = db.transaction("viewerStore", "readonly");
        const store = tx.objectStore("viewerStore");
        const index = store.index("titleIndex");
        const cursorRequest = index.openCursor();
        const results = [];
        cursorRequest.onsuccess = (e2) => {
            const cursor = e2.target.result;
            if (cursor) {
                if (searchText) {
                    if (cursor.value.title_lower.indexOf(searchText) != -1) {
                        results.push(cursor.value);
                    }
                } else {
                    results.push(cursor.value);
                }
                cursor.continue();
            } else{
                // End of results
                populateResults(results);
            }
        };
    }
}

function loadDataToIDB(data, clearDB = true) {
    if (clearDB) {
        const deleteRequest = indexedDB.deleteDatabase("viewerDB");
        setStatusMessage("Deleting previous database...");
        deleteRequest.onsuccess = (e) => {
            setStatusMessage("Deleted previous database");
            loadDataToIDB(data, false);
        };
        deleteRequest.onerror = (e) => {
            alert("Error deleting previous database!");
            console.error("IndexedDB error");
            console.error(e);
        };
        return; // Rest of processing done in recursive function
    }

    setStatusMessage("Opening database...");
    const openRequest = indexedDB.open("viewerDB");
    openRequest.onupgradeneeded = (e) => {
        const db = e.target.result;
        const store = db.createObjectStore("viewerStore", { keyPath: "id" });
        store.createIndex("titleIndex", "title_lower", { unique: true });
        setStatusMessage("Upgraded previous database");
    };
    openRequest.onsuccess = (e) => {
        setStatusMessage("Saving data into database...");
        const db = e.target.result;
        const tx = db.transaction("viewerStore", "readwrite");
        const store = tx.objectStore("viewerStore");
        for (let i = 0; i < data.items.length; i++) {
            data.items[i].title_lower = data.items[i].title.toLowerCase();
            store.add(data.items[i]);
            setStatusMessage("Saved item " + (i + 1) + " of " + data.items.length);
        }
        tx.oncomplete = (e) => {
            setStatusMessage("Saved data into database");
            searchTitles();
            switchActivity("search");
            alert("Data saved succesfully!");
        };
        tx.onerror = (e) => {
            setStatusMessage("Error saving data");
            alert("Error saving data!");
            console.error("IndexedDB error");
            console.error(e);
            switchActivity("search");
        };
    };
    openRequest.onerror = (e) => {
        setStatusMessage("Error saving data");
        alert("Error saving data! Please ensure you allowed data storage permission!");
        console.error("IndexedDB error");
        console.error(e);
        switchActivity("search");
    };
}

function loadData() {
    const fileElement = document.getElementById("data-file");
    if (fileElement.files.length > 0) {
        setStatusMessage("Reading file...");
        switchActivity("loading");
        let file = fileElement.files[0];
        let reader = new FileReader();
        reader.addEventListener("load", (e) => {
            let text = e.target.result;
            let data = JSON.parse(text)
            loadDataToIDB(data);
        });
        reader.readAsText(file);
    } else {
        alert("Please select a JSON file!");
    }
}

function onDocumentLoad() {
    document.getElementById("load-data-form").addEventListener("submit", (e) => {
        e.preventDefault();
        loadData();
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
    switchActivity("search");
    searchTitles();
}

window.addEventListener("load", (e) => onDocumentLoad());