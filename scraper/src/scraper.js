import axios from "axios";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path, { dirname } from "path";
import pLimit from "p-limit";
import { fileURLToPath } from "url";
import WebSocket from "ws";
import vanillaPuppeteer, { executablePath } from "puppeteer";
import { addExtra } from "puppeteer-extra";

const puppeteer = addExtra(vanillaPuppeteer);
puppeteer.use(StealthPlugin());

import http from "http";

const port = process.env.PORT || 3000;

console.log(`Using Puppeteer executable: ${puppeteer.executablePath()}`);

http
  .createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Scraper service running...");
  })
  .listen(port, () => {
    console.log(`Scraper service listening on port ${port}`);
  });

const connectWebSocket = () => {
  const ws = new WebSocket("ws:scraper-backend-pvvo.onrender.com/api/ws");

  ws.on("open", () => {
    console.log("Conexión WebSocket establecida con el servidor.");
  });

  ws.on("error", (error) => {
    console.error("Error en WebSocket:", error.message);
  });

  ws.on("close", () => {
    console.log("Conexión WebSocket cerrada. Reintentando...");
    setTimeout(connectWebSocket, 5000);
  });

  return ws;
};

const ws = connectWebSocket();

let addedCount = 0;
let removedCount = 0;
let existingCount = 0;

const removeDuplicates = (data) => {
  const uniqueDataMap = new Map();
  data.forEach((item) => {
    if (!uniqueDataMap.has(item.href)) {
      uniqueDataMap.set(item.href, item);
    }
  });
  return Array.from(uniqueDataMap.values());
};

const fetchCurrentAPIData = async () => {
  try {
    const response = await axios.get(
      "https://scraper-backend-pvvo.onrender.com/api/data"
    );
    console.log("Datos obtenidos de la API:", response.data);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error("Error obteniendo datos de la API:", error.message);
    return [];
  }
};

const sendDataToAPI = async (data) => {
  try {
    const response = await axios.post(
      "https://scraper-backend-pvvo.onrender.com/api/tasks",
      data
    );
    console.log(`Datos enviados exitosamente: ${response.status}`);
  } catch (error) {
    console.error("Error enviando datos a la API:", error.message);
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const delay = 100;
      const timer = setInterval(() => {
        const { scrollHeight } = document.body;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, delay);
    });
  });
};

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const listingPage = await browser.newPage();

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const baseUrl = "https://www.zonaprop.com.ar";
  const allScrapedData = [];
  const currentAPIData = await fetchCurrentAPIData();
  const currentAPIHrefs = new Set(currentAPIData.map((item) => item.href));
  const scrapedHrefs = new Set();

  const limit = pLimit(27);

  const outputPath = path.resolve(__dirname, "../../../scraped_data.json");

  if (fs.existsSync(outputPath)) {
    try {
      const rawData = fs.readFileSync(outputPath, "utf-8");
      const existingData = JSON.parse(rawData);
      const dedupedExistingData = removeDuplicates(existingData);
      dedupedExistingData.forEach((item) => scrapedHrefs.add(item.href));
      allScrapedData.push(...dedupedExistingData);
      console.log(
        `Cargados ${dedupedExistingData.length} datos existentes y eliminados duplicados.`
      );
    } catch (err) {
      console.error("Error al leer o parsear scraped_data.json:", err);
    }
  }

  await listingPage.setRequestInterception(true);
  listingPage.on("request", (request) => {
    const resourceType = request.resourceType();
    if (["image", "stylesheet", "font", "script"].includes(resourceType)) {
      request.abort();
    } else {
      request.continue();
    }
  });

  const retryNavigation = async (page, link, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Intentando navegar a ${link}, intento ${i + 1}`);
        await page.goto(link, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        return true;
      } catch (error) {
        console.error(
          `Error navegando a ${link}, intento ${i + 1}:`,
          error.message
        );
      }
    }
    console.error(
      `Falló la navegación después de ${retries} intentos: ${link}`
    );
    return false;
  };

  const processProperty = async (link) => {
    if (scrapedHrefs.has(link)) {
      console.log(`Propiedad ya procesada: ${link}`);
      return;
    }

    scrapedHrefs.add(link);

    const detailPage = await browser.newPage();
    try {
      await detailPage.setRequestInterception(true);
      detailPage.on("request", (request) => {
        request.continue();
      });

      console.log(`>>> Navegando a la propiedad: ${link}`);
      const success = await retryNavigation(detailPage, link);
      if (!success) {
        return;
      }

      await autoScroll(detailPage);
      await delay(200);

      const dataFromDetail = await detailPage.evaluate(() => {
        const extractText = (selector, regex) => {
          const element = document.querySelector(selector);
          if (!element?.textContent) return "";
          let text = element.textContent.replace(/\s+/g, " ").trim();
          if (regex) {
            const match = regex.exec(text);
            return match ? match[0] : "";
          }
          return text;
        };

        const price = extractText(".price-value", /(?:\$|USD)\s?[\d.,]+/i);
        const expenses = extractText(
          ".price-expenses",
          /(?:Expensas\s*\$?\s?[\d.,]+)/i
        );
        const location = extractText(
          ".section-location-property.section-location-property-classified"
        );
        const titleTypeSupProperty = extractText(
          ".title-type-sup-property",
          /^.+$/
        );
        const daysPublishedElement = document.querySelector("#user-views p");
        const daysPublished = daysPublishedElement
          ? daysPublishedElement.textContent?.trim() || ""
          : "";

        const viewsElement = Array.from(
          document.querySelectorAll("#user-views p")
        ).find((p) => p.textContent?.includes("visualizaciones"));
        const views = viewsElement
          ? (viewsElement.textContent?.match(/\d+/) || [""])[0]
          : "";

        const images = [];
        const multimediaContent = document.querySelector("#multimedia-content");
        if (multimediaContent) {
          multimediaContent.querySelectorAll("img").forEach((img) => {
            const src =
              img.getAttribute("src") ||
              img.getAttribute("data-flickity-lazyload");
            if (src?.includes("zonapropcdn.com")) {
              images.push(src);
            }
          });
        }

        return {
          price,
          expenses,
          location,
          href: window.location.href,
          images,
          discount: "",
          titleTypeSupProperty,
          daysPublished,
          views,
        };
      });

      await sendDataToAPI(dataFromDetail);
      addedCount++;
      console.log("Datos extraídos y enviados:", dataFromDetail);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(dataFromDetail));
      }
    } catch (err) {
      console.error("Error extrayendo datos de una propiedad:", err);
    } finally {
      await detailPage.close();
    }
  };

  const scrapeOnce = async () => {
    let currentPage = 1;
    let previousPages = new Set();
    let consecutiveMatches = 0;

    while (true) {
      const url = `${baseUrl}/departamentos-alquiler-capital-federal-pagina-${currentPage}.html`;
      console.log(`\nNavegando a la página de listados: ${url}`);

      try {
        await listingPage.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      } catch (err) {
        console.error(`Error al navegar a la página ${url}:`, err);
        break;
      }

      const propertyLinks = await listingPage.evaluate((baseUrl) => {
        const anchors = document.querySelectorAll(
          '[data-qa="POSTING_CARD_DESCRIPTION"] a'
        );
        const links = [];
        anchors.forEach((a) => {
          const rawHref = a.getAttribute("href") || "";
          const fullHref = rawHref.startsWith("http")
            ? rawHref
            : `${baseUrl}${rawHref}`;
          if (fullHref && !links.includes(fullHref)) {
            links.push(fullHref);
          }
        });
        return links;
      }, baseUrl);

      console.log(
        `Propiedades encontradas en la página ${currentPage}: ${propertyLinks.length}`
      );

      if (propertyLinks.length === 0) {
        console.log(
          "No se encontraron propiedades en esta página. Finalizando."
        );
        break;
      }

      const newProperties = propertyLinks.filter(
        (link) => !scrapedHrefs.has(link) && !currentAPIHrefs.has(link)
      );

      if (newProperties.length === 0) {
        consecutiveMatches++;
        console.log(
          `Todas las propiedades de la página ${currentPage} ya están procesadas.`
        );
      } else {
        consecutiveMatches = 0;
        await Promise.all(
          newProperties.map((link) => limit(() => processProperty(link)))
        );
      }

      if (previousPages.has(currentPage)) {
        console.log(
          "Se detectó un bucle en las páginas visitadas. Finalizando."
        );
        break;
      }
      previousPages.add(currentPage);

      if (consecutiveMatches >= 3) {
        console.log(
          "No se encontraron nuevas propiedades en varias páginas consecutivas. Finalizando."
        );
        break;
      }

      currentPage++;
    }
  };

  const scrapedHrefsArray = Array.from(scrapedHrefs);
  const obsoleteData = currentAPIData.filter(
    (item) => !scrapedHrefsArray.includes(item.href)
  );

  for (const data of obsoleteData) {
    try {
      await axios.delete(
        `https://scraper-backend-pvvo.onrender.com/api/data/${data.id}`
      );
      removedCount++;
      console.log(`Dato obsoleto eliminado: ${data.href}`);
    } catch (error) {
      console.error("Error eliminando dato obsoleto:", error.message);
    }
  }

  await scrapeOnce();
  console.log("\nResumen de la ejecución:");
  console.log(`Propiedades agregadas: ${addedCount}`);
  console.log(`Propiedades eliminadas: ${removedCount}`);
  console.log(`Propiedades existentes: ${existingCount}`);

  await browser.close();
})();
