require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 可查詢的縣市列表（需與 CWA locationName 一致）
const ALLOWED_CITY_NAMES = [
  "基隆市",
  "臺北市",
  "新北市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

// 將 CWA 回傳的天氣要素整理為可讀格式
const parseWeatherElements = (weatherElements) => {
  const timeCount = weatherElements?.[0]?.time?.length || 0;
  const forecasts = [];

  for (let i = 0; i < timeCount; i++) {
    const forecast = {
      startTime: weatherElements[0].time[i].startTime,
      endTime: weatherElements[0].time[i].endTime,
      weather: "",
      rain: "",
      minTemp: "",
      maxTemp: "",
      comfort: "",
      windSpeed: "",
    };

    weatherElements.forEach((element) => {
      const value = element.time[i].parameter;
      switch (element.elementName) {
        case "Wx":
          forecast.weather = value.parameterName;
          break;
        case "PoP":
          forecast.rain = value.parameterName + "%";
          break;
        case "MinT":
          forecast.minTemp = value.parameterName + "°C";
          break;
        case "MaxT":
          forecast.maxTemp = value.parameterName + "°C";
          break;
        case "CI":
          forecast.comfort = value.parameterName;
          break;
        case "WS":
          forecast.windSpeed = value.parameterName;
          break;
      }
    });

    forecasts.push(forecast);
  }

  return forecasts;
};

// 呼叫 CWA API，locationName 預設空值以取得全部縣市資料
const fetchWeatherDataset = async (locationName = "") => {
  return axios.get(`${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`, {
    params: {
      Authorization: CWA_API_KEY,
      locationName,
    },
  });
};

// 組裝單一縣市的天氣資料
const buildLocationWeather = (location, datasetDescription) => ({
  city: location.locationName,
  updateTime: datasetDescription,
  forecasts: parseWeatherElements(location.weatherElement),
});

/**
 * 取得特定縣市天氣預報
 * locationName 由路由參數帶入，需符合允許列表
 */
const getCityWeather = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    const cityName = decodeURIComponent(req.params.cityName || "");
    if (!ALLOWED_CITY_NAMES.includes(cityName)) {
      return res.status(400).json({
        error: "不支援的縣市",
        message: `請使用以下縣市名稱：${ALLOWED_CITY_NAMES.join("、")}`,
      });
    }

    const response = await fetchWeatherDataset(cityName);
    const locationData = response.data.records.location?.[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${cityName} 天氣資料`,
      });
    }

    const weatherData = buildLocationWeather(
      locationData,
      response.data.records.datasetDescription
    );

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得特定縣市天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 取得高雄天氣預報
 * CWA 氣象資料開放平臺 API
 * 使用「一般天氣預報-今明 36 小時天氣預報」資料集
 */
const getKaohsiungWeather = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    // API 文件: https://opendata.cwa.gov.tw/dist/opendata-swagger.html
    const response = await fetchWeatherDataset("高雄市");

    // 取得高雄市的天氣資料
    const locationData = response.data.records.location?.[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: "無法取得高雄市天氣資料",
      });
    }

    const weatherData = buildLocationWeather(
      locationData,
      response.data.records.datasetDescription
    );

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 取得全部縣市天氣預報
 * locationName 以空值查詢，回傳所有縣市的 36 小時預報
 */
const getAllCityWeather = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    const response = await fetchWeatherDataset("");
    const locations = response.data.records.location || [];

    if (locations.length === 0) {
      return res.status(404).json({
        error: "查無資料",
        message: "無法取得全縣市天氣資料",
      });
    }

    const datasetDescription = response.data.records.datasetDescription;
    const weatherData = locations.map((location) =>
      buildLocationWeather(location, datasetDescription)
    );

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得全部縣市天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    ALLOWED_CITY_NAMES: [
      "基隆市",
      "臺北市",
      "新北市",
      "桃園市",
      "新竹市",
      "新竹縣",
      "苗栗縣",
      "臺中市",
      "彰化縣",
      "南投縣",
      "雲林縣",
      "嘉義市",
      "嘉義縣",
      "臺南市",
      "高雄市",
      "屏東縣",
      "宜蘭縣",
      "花蓮縣",
      "臺東縣",
      "澎湖縣",
      "金門縣",
      "連江縣",
    ],
    endpoints: {
      kaohsiung: "/api/weather/kaohsiung",
      all: "/api/weather/all",
      city: "/api/weather/city/:cityName",
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得高雄天氣預報
app.get("/api/weather/kaohsiung", getKaohsiungWeather);

// 取得特定縣市天氣預報
app.get("/api/weather/city/:cityName", getCityWeather);

// 取得全部縣市天氣預報
app.get("/api/weather/all", getAllCityWeather);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
