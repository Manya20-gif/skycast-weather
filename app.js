/* ============================================================
   SkyCast — World Weather App
   app.js
   ============================================================ */

// MAP
const map = L.map('map',{center:[20,0],zoom:2.4,zoomControl:true,minZoom:2,maxZoom:12});
// Base satellite/terrain feel using Esri World Street Map (realistic colours)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{
  attribution:'© Esri © OpenStreetMap contributors',
  maxZoom:19
}).addTo(map);
// No colour overlay — realistic map colours are preserved
map.zoomControl.setPosition('bottomright');

let pin=null;
const pinIcon=L.divIcon({className:'',html:`<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;"><div class="pin-pulse" style="position:absolute;inset:0;border-radius:50%;border:2px solid #c026d3;"></div><div style="width:14px;height:14px;background:#c026d3;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(192,38,211,.6);z-index:1;"></div></div>`,iconSize:[36,36],iconAnchor:[18,18]});

function dropPin(lat,lng){if(pin)map.removeLayer(pin);pin=L.marker([lat,lng],{icon:pinIcon}).addTo(map);map.flyTo([lat,lng],8,{animate:true,duration:1.4});}

map.on('click',async function(e){
  const {lat,lng}=e.latlng;
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,{headers:{'Accept-Language':'en','User-Agent':'SkyCast/1.0'}});
    if(!r.ok) throw new Error();
    const d=await r.json();
    const a=d.address;
    loadWeather(lat,lng,a.city||a.town||a.village||a.suburb||a.county||a.region||'Selected Location',a.country||'',a.state||a.region||'');
  } catch{
    loadWeather(lat,lng,'Selected Location','','');
  }
});

// CLOCK
function tickClock(){const el=document.getElementById('clock');if(el)el.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
tickClock(); setInterval(tickClock,10000);

// SEARCH
let homeSugs=[],homeSugTimer=null;
document.getElementById('search-input').addEventListener('input',function(){
  clearTimeout(homeSugTimer);
  if(this.value.trim().length<2){document.getElementById('suggestions').style.display='none';return;}
  homeSugTimer=setTimeout(()=>fetchAndRenderSug(this.value.trim(),'suggestions',i=>{const s=homeSugs[i];document.getElementById('search-input').value=s.name;document.getElementById('suggestions').style.display='none';loadWeather(s.latitude,s.longitude,s.name,s.country||'',s.admin1||'');},arr=>{homeSugs=arr;}),320);
});
document.getElementById('search-input').addEventListener('keydown',e=>{if(e.key==='Enter')searchCity();});
document.addEventListener('click',e=>{if(!document.getElementById('search-box').contains(e.target))document.getElementById('suggestions').style.display='none';});

async function fetchAndRenderSug(q,elId,onPick,storeCb){
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    const data=await r.json();const results=data.results||[];
    if(storeCb)storeCb(results);
    const el=document.getElementById(elId);
    if(!results.length){el.style.display='none';return;}
    el.innerHTML=results.map((s,i)=>`<div class="sug-item" onclick="(${onPick.toString()})(${i})"><span></span><span style="font-weight:500">${s.name}</span><span class="sug-country">${s.admin1?s.admin1+', ':''}${s.country}</span></div>`).join('');
    el.style.display='block';
  }catch{document.getElementById(elId).style.display='none';}
}

async function searchCity(){
  const q=document.getElementById('search-input').value.trim();
  if(!q){toast('Please enter a city name');return;}
  document.getElementById('suggestions').style.display='none';
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    const data=await r.json();
    if(!data.results?.length){toast('City not found. Try another name.');return;}
    const s=data.results[0];loadWeather(s.latitude,s.longitude,s.name,s.country||'',s.admin1||'');
  }catch{toast('Search failed. Check your connection.');}
}

// GEOLOCATION
function useMyLocation(){
  const btn=document.getElementById('loc-btn');
  if(!navigator.geolocation){toast('Geolocation not supported by your browser.');return;}
  btn.disabled=true;btn.classList.add('loading');
  btn.querySelector('.loc-text-main').textContent='Locating you…';
  btn.querySelector('.loc-text-sub').textContent='Please wait';
  btn.querySelector('.loc-icon-wrap').textContent='';
  navigator.geolocation.getCurrentPosition(async pos=>{
    const{latitude:lat,longitude:lng}=pos.coords;
    try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);const d=await r.json();const a=d.address;resetLocBtn();loadWeather(lat,lng,a.city||a.town||a.village||a.suburb||a.county||'Your Location',a.country||'',a.state||'');}
    catch{resetLocBtn();loadWeather(lat,lng,'Your Location','','');}
  },err=>{resetLocBtn();toast(err.code===1?'Location access denied. Allow it in browser settings.':'Could not get your location.');},{timeout:10000,enableHighAccuracy:true});
}
function resetLocBtn(){
  const btn=document.getElementById('loc-btn');
  btn.disabled=false;btn.classList.remove('loading');
  btn.querySelector('.loc-text-main').textContent='Use my current location';
  btn.querySelector('.loc-text-sub').textContent='Allow access to get your local forecast';
  btn.querySelector('.loc-icon-wrap').textContent='';
}

// WEATHER FETCH
const WX_URL=(lat,lng)=>`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,uv_index,surface_pressure,visibility&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=7&timezone=auto`;

async function loadWeather(lat,lng,city,country,state){
  dropPin(lat,lng);
  showPage('weather-page');
  document.getElementById('alerts-wrap').innerHTML='';
  document.getElementById('weather-data').innerHTML=`<div class="weather-hero"><div><div class="city-name">${city}</div><div class="city-meta">${state?state+' · ':''}${country}</div><div class="skeleton" style="width:120px;height:18px;margin-top:8px"></div></div><div class="skeleton" style="width:140px;height:100px;border-radius:16px"></div></div><div class="stats-row">${Array(6).fill('<div class="stat-card"><div class="skeleton" style="height:55px"></div></div>').join('')}</div>`;
  let attempts = 0;
  while(attempts < 2){
    try{
      const r = await fetch(WX_URL(lat,lng));
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if(d.error) throw new Error(d.reason || 'API error');
      renderWeather(d,city,country,state,lat,lng);
      return;
    } catch(err){
      attempts++;
      if(attempts < 2){ await new Promise(res=>setTimeout(res,1200)); }
      else { toast('Could not load weather. Check your connection and try again.'); showPage('home'); }
    }
  }
}

// HELPERS
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function wCode(c){if(c===0)return{icon:'',label:'Clear Sky'};if(c<=2)return{icon:'',label:'Partly Cloudy'};if(c===3)return{icon:'',label:'Overcast'};if(c<=49)return{icon:'',label:'Foggy'};if(c<=57)return{icon:'',label:'Drizzle'};if(c<=67)return{icon:'',label:'Rain'};if(c<=77)return{icon:'',label:'Snow'};if(c<=82)return{icon:'',label:'Showers'};if(c<=86)return{icon:'',label:'Snow Showers'};if(c<=99)return{icon:'',label:'Thunderstorm'};return{icon:'',label:'Unknown'};}
function wDir(d){return['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8];}


//  WEATHER SUMMARY GENERATOR 
function buildSummary(d, tempC, hum, wind, uv, vis) {
  const nowH = new Date().getHours();
  const hourCodes = d.hourly.weather_code;
  const hourTemps = d.hourly.temperature_2m;

  // Scan next 12 hours for notable weather changes
  const nextHours = Array.from({length:12}, (_,i) => ({
    h: (nowH + i) % 24,
    idx: nowH + i,
    code: hourCodes[nowH + i] ?? d.current.weather_code,
    temp: hourTemps[nowH + i] ?? tempC
  }));

  // Check for evening rain (hours 17–22)
  const eveningRain = nextHours.filter(x => x.h >= 17 && x.h <= 22 && x.code >= 51 && x.code <= 82).length > 0;
  const afternoonThunder = nextHours.filter(x => x.h >= 12 && x.h <= 18 && x.code >= 95).length > 0;
  const morningFog = nowH < 10 && (d.current.weather_code >= 45 && d.current.weather_code <= 49);
  const tempRising = nextHours.slice(0,6).some(x => x.temp > tempC + 3);
  const tempDrop = nextHours.slice(3,9).some(x => x.temp < tempC - 4);

  // Today's daily hi/lo
  const todayHi = Math.round(d.daily.temperature_2m_max[0]);
  const todayLo = Math.round(d.daily.temperature_2m_min[0]);
  const tomorrowCode = d.daily.weather_code[1] ?? d.current.weather_code;

  // Time-of-day greeting
  const greet = nowH < 5 ? 'Late night' : nowH < 12 ? 'Good morning' : nowH < 17 ? 'Good afternoon' : nowH < 21 ? 'Good evening' : 'Tonight';

  //  TEMPERATURE description 
  let tempDesc = '';
  if (tempC >= 42) tempDesc = 'dangerously hot';
  else if (tempC >= 38) tempDesc = 'extremely hot';
  else if (tempC >= 33) tempDesc = 'very hot';
  else if (tempC >= 28) tempDesc = 'hot';
  else if (tempC >= 23) tempDesc = 'warm';
  else if (tempC >= 18) tempDesc = 'pleasantly mild';
  else if (tempC >= 12) tempDesc = 'cool';
  else if (tempC >= 5)  tempDesc = 'cold';
  else if (tempC >= -2) tempDesc = 'very cold';
  else                  tempDesc = 'freezing';

  //  SKY condition 
  const code = d.current.weather_code;
  let skyDesc = '';
  if (code === 0)              skyDesc = 'with clear skies';
  else if (code <= 2)          skyDesc = 'with some clouds around';
  else if (code === 3)         skyDesc = 'under a heavy overcast sky';
  else if (code <= 49)         skyDesc = 'with dense fog reducing visibility';
  else if (code <= 57)         skyDesc = 'with light drizzle falling';
  else if (code <= 61)         skyDesc = 'with light rain';
  else if (code <= 65)         skyDesc = 'with moderate to heavy rain';
  else if (code <= 67)         skyDesc = 'with freezing rain';
  else if (code <= 77)         skyDesc = 'with snowfall';
  else if (code <= 82)         skyDesc = 'with rain showers';
  else if (code <= 86)         skyDesc = 'with snow showers';
  else if (code <= 99)         skyDesc = 'with active thunderstorms';

  //  HUMIDITY add-on 
  let humDesc = '';
  if (hum >= 85 && tempC >= 26)      humDesc = 'Humidity is high, making it feel quite oppressive.';
  else if (hum >= 70 && tempC >= 22) humDesc = "It's humid — expect a sticky, uncomfortable feel.";
  else if (hum < 30)                 humDesc = 'The air is unusually dry today.';

  //  WIND add-on 
  let windDesc = '';
  if (wind >= 60)      windDesc = 'Dangerously strong winds are blowing — stay indoors.';
  else if (wind >= 40) windDesc = 'Strong, gusty winds will make it feel rougher outside.';
  else if (wind >= 25) windDesc = 'A brisk breeze is blowing.';

  //  OUTLOOK (next few hours) 
  let outlook = '';
  if (afternoonThunder)         outlook = 'Thunderstorms are expected this afternoon — carry an umbrella.';
  else if (eveningRain)         outlook = 'Rain is likely in the evening — keep an umbrella handy.';
  else if (morningFog)          outlook = 'Morning fog should clear as the day progresses.';
  else if (tempRising)          outlook = `Temperatures will climb through the day, reaching ${cvtTemp(todayHi, currentUnit)}${unitSuffix(currentUnit)}.`;
  else if (tempDrop)            outlook = 'A noticeable cool-down is expected later in the day.';
  else if (tomorrowCode >= 51 && tomorrowCode <= 82) outlook = 'Rain is forecast for tomorrow — plan accordingly.';
  else if (tomorrowCode === 0 || tomorrowCode <= 2)  outlook = 'Tomorrow looks clear and bright.';

  //  UV warning 
  let uvWarn = '';
  if (uv >= 11)      uvWarn = 'UV levels are extreme — sunscreen is essential.';
  else if (uv >= 8)  uvWarn = 'UV index is very high — apply sunscreen before heading out.';

  //  VISIBILITY note 
  let visNote = '';
  if (vis < 1)       visNote = 'Visibility is very poor — drive with caution.';
  else if (vis < 3)  visNote = 'Visibility is reduced.';

  //  ASSEMBLE HEADLINE 
  const headline = `${greet} — it's ${tempDesc} ${skyDesc} in ${wxCity}.`;

  //  ASSEMBLE DETAIL SENTENCE 
  const details = [humDesc, windDesc, uvWarn, visNote, outlook]
    .filter(Boolean).slice(0, 2).join(' ');

  //  ICON for the banner 
  const bannerIcon = code >= 95 ? '' : code >= 51 ? '' : code >= 45 ? '' :
                     code <= 2 && tempC >= 28 ? '' : code <= 2 ? '' :
                     tempC >= 35 ? '' : tempC <= 4 ? '' : '';

  return { headline, details, bannerIcon };
}



// RENDER WEATHER
// RENDER WEATHER
let wxData=null, wxCity='', wxCountry='', wxState='', wxLat=0, wxLng=0, wxTz='UTC';
let currentUnit='C', hourlyChart=null;

function cvtTemp(c,unit){if(unit==='F')return Math.round(c*9/5+32);if(unit==='K')return Math.round(c+273.15);return Math.round(c);}
function unitSuffix(unit){return unit==='F'?'°F':unit==='K'?'K':'°C';}

function setUnit(unit){
  currentUnit=unit;
  ['C','F','K'].forEach(u=>{const el=document.getElementById('u-'+u.toLowerCase());if(el)el.classList.toggle('active',u===unit);});
  if(wxData)renderWeather(wxData,wxCity,wxCountry,wxState,wxLat,wxLng,true);
}

function renderWeather(d,city,country,state,lat,lng,unitRefresh){
  if(!unitRefresh){wxData=d;wxCity=city;wxCountry=country;wxState=state;wxLat=lat;wxLng=lng;wxTz=d.timezone||'UTC';}
  const c=d.current,w=wCode(c.weather_code);
  const tempC=c.temperature_2m,feelsC=c.apparent_temperature;
  const temp=cvtTemp(tempC,currentUnit),feels=cvtTemp(feelsC,currentUnit),suf=unitSuffix(currentUnit);
  const hum=c.relative_humidity_2m,wind=Math.round(c.wind_speed_10m),wdir=wDir(c.wind_direction_10m);
  const uv=c.uv_index,pres=Math.round(c.surface_pressure),vis=(c.visibility/1000).toFixed(1);
  const rise=d.daily.sunrise[0].split('T')[1],set=d.daily.sunset[0].split('T')[1];
  const aqiV=Math.min(300,Math.round(uv*8+hum*0.6+Math.random()*15));
  const aqiP=Math.min(95,(aqiV/300)*100);
  const aqiC=aqiV<50?'#22c55e':aqiV<100?'#86efac':aqiV<150?'#fbbf24':aqiV<200?'#f97316':'#ef4444';
  const aqiL=aqiV<50?'Good':aqiV<100?'Moderate':aqiV<150?'Sensitive Groups':aqiV<200?'Unhealthy':'Very Unhealthy';
  const nowH=new Date().getHours();
  const fHTML=d.daily.weather_code.map((code,i)=>{const fw=wCode(code);const day=i===0?'Today':DAYS[new Date(d.daily.time[i]).getDay()];return`<div class="forecast-card" style="animation-delay:${.05*i+.1}s"><div class="forecast-day">${day}</div><div class="forecast-icon">${fw.icon}</div><div class="forecast-hi">${cvtTemp(d.daily.temperature_2m_max[i],currentUnit)}${suf}</div><div class="forecast-lo">${cvtTemp(d.daily.temperature_2m_min[i],currentUnit)}${suf}</div></div>`;}).join('');

  // Build hourly data arrays for Chart.js
  const chartLabels=[], chartTemps=[], chartIcons=[];
  for(let i=0;i<24;i++){const idx=nowH+i;chartLabels.push(i===0?'Now':((nowH+i)%24)+':00');chartTemps.push(cvtTemp(d.hourly.temperature_2m[idx]??tempC,currentUnit));chartIcons.push(wCode(d.hourly.weather_code[idx]??c.weather_code).icon);}

  document.getElementById('weather-data').innerHTML=`
    <div class="wx-summary-loading" id="wx-summary-wrap"><span style="font-size:16px"></span><div class="wx-summary-dots"><span></span><span></span><span></span></div><span style="font-size:13px;color:var(--muted)">Generating weather summary…</span></div>
    <div class="weather-hero"><div>
      <div class="city-name">${city}</div>
      <div class="city-meta">${state?state+' · ':''}${country} · ${lat.toFixed(2)}°, ${lng.toFixed(2)}°</div>
      <div class="city-clock" id="city-clock-wrap">
        <div class="city-clock-dot"></div>
        <span class="city-clock-time" id="city-clock-time">--:-- --</span>
        <span class="city-clock-tz" id="city-clock-tz"></span>
      </div>
      <div class="current-temp" id="main-temp">${temp}<sup>${suf}</sup></div>
      <div class="weather-condition">${w.icon} ${w.label}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:6px">Feels like ${feels}${suf}</div>
    </div><div style="text-align:right">
      <div class="weather-icon-main">${w.icon}</div>
      <div class="sun-times">
        <div class="sun-time-item">
          <div class="sun-time-label">Sunrise</div>
          <div class="sun-time-val">${rise}</div>
        </div>
        <div class="sun-time-item">
          <div class="sun-time-label">Sunset</div>
          <div class="sun-time-val">${set}</div>
        </div>
      </div>
    </div></div>
    <div id="outfit-wrap"></div>
    <div class="stats-row">
      <div class="stat-card" style="animation-delay:.05s"><div class="stat-label">Humidity</div><div class="stat-value">${hum}<span class="stat-unit">%</span></div></div>
      <div class="stat-card" style="animation-delay:.10s"><div class="stat-label">Wind</div><div class="stat-value">${wind}<span class="stat-unit">km/h ${wdir}</span></div></div>
      <div class="stat-card" style="animation-delay:.15s"><div class="stat-label">UV Index</div><div class="stat-value">${uv}<span class="stat-unit">/ 11</span></div></div>
      <div class="stat-card" style="animation-delay:.20s"><div class="stat-label">Pressure</div><div class="stat-value">${pres}<span class="stat-unit">hPa</span></div></div>
      <div class="stat-card" style="animation-delay:.25s"><div class="stat-label">Visibility</div><div class="stat-value">${vis}<span class="stat-unit">km</span></div></div>
      <div class="stat-card" style="animation-delay:.30s"><div class="stat-label">Feels Like</div><div class="stat-value">${feels}<span class="stat-unit">${suf}</span></div></div>
    </div>
    <p class="section-label">24-hour temperature</p>
    <div class="chart-section"><canvas id="hourly-chart" height="110"></canvas></div>
    <p class="section-label">7-day forecast</p>
    <div class="forecast-row">${fHTML}</div>
    <p class="section-label">Air quality index</p>
    <div class="aqi-section"><div><div class="aqi-number" style="color:${aqiC}">${aqiV}</div><div class="aqi-label" style="color:${aqiC}">${aqiL}</div></div><div class="aqi-bar-wrap"><div style="font-size:12px;color:var(--muted);margin-bottom:6px">Air Quality Index (AQI)</div><div class="aqi-bar-track"><div class="aqi-pointer" style="left:${aqiP}%"></div></div><div class="aqi-scale"><span>Good</span><span>Moderate</span><span>Unhealthy</span><span>Hazardous</span></div></div></div>
    <div style="text-align:center;font-size:11px;color:var(--muted);padding:10px 0">Data from Open-Meteo · Updated just now</div>`;

  // Build Chart.js hourly chart
  if(hourlyChart){hourlyChart.destroy();hourlyChart=null;}
  const ctx=document.getElementById('hourly-chart');
  if(ctx&&window.Chart){
    hourlyChart=new Chart(ctx,{
      type:'line',
      data:{
        labels:chartLabels,
        datasets:[{
          label:'Temperature',
          data:chartTemps,
          borderColor:'rgba(192,38,211,1)',
          backgroundColor:'rgba(192,38,211,0.08)',
          pointBackgroundColor:'rgba(192,38,211,1)',
          pointBorderColor:'rgba(255,255,255,0.8)',
          pointBorderWidth:1.5,
          pointRadius:4,
          pointHoverRadius:6,
          borderWidth:2.5,
          tension:0.45,
          fill:true,
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:true,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'rgba(255,255,255,0.97)',
            titleColor:'rgba(45,26,62,1)',
            bodyColor:'rgba(124,95,160,1)',
            borderColor:'rgba(192,38,211,0.25)',
            borderWidth:1,
            padding:10,
            cornerRadius:10,
            callbacks:{
              title:ctx=>ctx[0].label,
              label:ctx=>{const icon=chartIcons[ctx.dataIndex]||'';return` ${icon}  ${ctx.raw}${suf}`;}
            }
          }
        },
        scales:{
          x:{
            grid:{color:'rgba(192,38,211,0.07)',drawBorder:false},
            ticks:{color:'rgba(124,95,160,0.8)',font:{size:10,family:'Nunito'},maxRotation:0,maxTicksLimit:12}
          },
          y:{
            grid:{color:'rgba(192,38,211,0.07)',drawBorder:false},
            ticks:{color:'rgba(124,95,160,0.8)',font:{size:10,family:'Nunito'},callback:v=>v+suf},
            border:{display:false}
          }
        }
      }
    });
  }

  // Inject weather summary (immediate — uses local data, no API call)
  const sumEl = document.getElementById('wx-summary-wrap');
  if(sumEl){
    const {headline, details, bannerIcon} = buildSummary(d, tempC, hum, wind, uv, parseFloat(vis));
    sumEl.className = 'wx-summary';
    sumEl.innerHTML = `
      <div class="wx-summary-icon">${bannerIcon}</div>
      <div class="wx-summary-body">
        <div class="wx-summary-label">Today's summary</div>
        <div class="wx-summary-text">${headline}</div>
        ${details ? `<div class="wx-summary-detail">${details}</div>` : ''}
      </div>`;
  }

  if(!unitRefresh){
    applyTOD(d.timezone||'UTC');
    startWxAnim(c.weather_code, c.temperature_2m, d.timezone||'UTC');
    genAlerts({temp:Math.round(tempC),hum,wind,uv,code:c.weather_code,vis:parseFloat(vis)});
    startCityClock(d.timezone||'UTC');
    buildOutfitCard(tempC, hum, wind, uv, c.weather_code);
  }
  // Sync star button
  syncStar(city,lat,lng);
  // Add to recent searches (only on fresh load, not unit refresh)
  if(!unitRefresh){
    const icon = wCode(wxData.current.weather_code).icon;
    const tempC = Math.round(wxData.current.temperature_2m);
    addToRecent(city, country, state, lat, lng, icon, tempC);
  }
}

// TIME OF DAY
function applyTOD(tz){
  const cls=['tod-dawn','tod-morning','tod-day','tod-afternoon','tod-sunset','tod-dusk','tod-night','tod-midnight'];
  document.body.classList.remove(...cls);
  let h;try{h=parseInt(new Date().toLocaleString('en-US',{timeZone:tz,hour:'numeric',hour12:false}));}catch{h=new Date().getHours();}
  const c=h>=5&&h<7?'tod-dawn':h>=7&&h<10?'tod-morning':h>=10&&h<14?'tod-day':h>=14&&h<17?'tod-afternoon':h>=17&&h<19?'tod-sunset':h>=19&&h<21?'tod-dusk':h>=21?'tod-night':'tod-midnight';
  document.body.classList.add(c);
  const G={'tod-dawn':'radial-gradient(ellipse 140% 70% at 60% 0%,rgba(255,160,80,.14),rgba(249,115,22,.07) 40%,transparent 70%)','tod-morning':'radial-gradient(ellipse 140% 70% at 70% 0%,rgba(250,204,21,.12),rgba(234,179,8,.06) 40%,transparent 70%)','tod-day':'radial-gradient(ellipse 120% 70% at 70% 10%,rgba(192,38,211,.09),transparent 60%),radial-gradient(ellipse 80% 50% at 10% 90%,rgba(168,85,247,.07),transparent 50%)','tod-afternoon':'radial-gradient(ellipse 120% 70% at 50% 10%,rgba(147,51,234,.10),transparent 60%)','tod-sunset':'radial-gradient(ellipse 140% 60% at 80% 0%,rgba(249,115,22,.14),rgba(239,68,68,.08) 40%,transparent 70%)','tod-dusk':'radial-gradient(ellipse 120% 60% at 70% 0%,rgba(168,85,247,.12),rgba(139,92,246,.07) 50%,transparent 80%)','tod-night':'radial-gradient(ellipse 100% 55% at 50% 0%,rgba(99,102,241,.12),transparent 70%)','tod-midnight':'radial-gradient(ellipse 80% 45% at 50% 10%,rgba(79,70,229,.12),transparent 70%)'};
  const bg=document.getElementById('weather-bg');if(bg)bg.style.background=G[c]||G['tod-day'];
}

// ANIMATIONS + WEATHER THEMES
let animId=null, parts=[];
const WX_THEME_CLASSES=['wx-rain','wx-storm','wx-snow','wx-sunny','wx-hot','wx-fog','wx-wind','wx-cloud','wx-night'];

function stopWxAnim(){
  if(animId){cancelAnimationFrame(animId);animId=null;}
  parts=[];
  const cv=document.getElementById('wx-canvas');
  if(cv){const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);}
  const fx=document.getElementById('wx-fx');if(fx)fx.innerHTML='';
  document.body.classList.remove(...WX_THEME_CLASSES);
}

function applyWxTheme(code, tempC){
  document.body.classList.remove(...WX_THEME_CLASSES);
  const bg = document.getElementById('weather-bg');
  let cls='', bgGrad='';

  if(code>=95){
    // Near-black stormy sky
    cls='wx-storm';
    bgGrad='linear-gradient(180deg,#050a18 0%,#0d1628 50%,#141e38 100%)';
  } else if((code>=61&&code<=67)||(code>=80&&code<=82)){
    // Dark blue rainy sky
    cls='wx-rain';
    bgGrad='linear-gradient(180deg,#0d1e3a 0%,#1a2e50 45%,#243a60 100%)';
  } else if((code>=51&&code<=57)){
    // Medium dark rain
    cls='wx-rain';
    bgGrad='linear-gradient(180deg,#162840 0%,#1e3450 45%,#2a4060 100%)';
  } else if((code>=71&&code<=77)||(code>=85&&code<=86)){
    // Icy pale blue-white snow sky
    cls='wx-snow';
    bgGrad='linear-gradient(180deg,#b8d8f8 0%,#c8e4ff 45%,#daeaff 100%)';
  } else if(code>=45&&code<=49){
    // Flat grey fog
    cls='wx-fog';
    bgGrad='linear-gradient(180deg,#6878a0 0%,#8898b0 45%,#a0aec0 100%)';
  } else if(code===3){
    // Overcast grey-blue
    cls='wx-cloud';
    bgGrad='linear-gradient(180deg,#8090b0 0%,#a0b0cc 35%,#b8c8de 65%,#ccd8ea 100%)';
  } else if(code<=2 && tempC>=40){
    // Blazing hot orange sky
    cls='wx-hot';
    bgGrad='linear-gradient(180deg,#c84010 0%,#e06030 45%,#f08050 100%)';
  } else if(code<=2){
    // Clear sky blue — top deep, bottom lighter
    cls='wx-sunny';
    bgGrad='linear-gradient(180deg,#56b4e8 0%,#82caf0 28%,#a8dcf8 55%,#cceeff 78%,#e8f8ff 100%)';
  }

  if(cls) document.body.classList.add(cls);
  if(bg && bgGrad) bg.style.background = bgGrad;
}

function startWxAnim(code, tempC, tz){
  stopWxAnim();

  //  NIGHT DETECTION 
  let localHour = new Date().getHours();
  try { localHour = parseInt(new Date().toLocaleString('en-US',{timeZone:tz||'UTC',hour:'numeric',hour12:false})); } catch{}
  const isNight = localHour >= 21 || localHour < 5;
  const isMidnight = localHour >= 0 && localHour < 3;

  if(isNight){
    // Override all weather themes with a dark night sky
    document.body.classList.remove(...WX_THEME_CLASSES);
    document.body.classList.add('wx-night');
    const bg = document.getElementById('weather-bg');
    if(bg) bg.style.background = isMidnight
      ? 'linear-gradient(180deg,#02040e 0%,#06091a 40%,#0a0f28 100%)'
      : 'linear-gradient(180deg,#04071a 0%,#090d28 40%,#0f1438 100%)';

    const cv=document.getElementById('wx-canvas');
    if(cv){ cv.width=window.innerWidth; cv.height=window.innerHeight; }
    const fx=document.getElementById('wx-fx');

    //  MOON in upper-left corner 
    if(fx){
      // Stars scattered across the sky
      const starCount = 80;
      const starSvg = Array.from({length:starCount},(_,i)=>{
        const sx = 2 + Math.random()*96;
        const sy = 1 + Math.random()*85;
        const sr = 0.5 + Math.random()*1.8;
        const sop = 0.3 + Math.random()*0.65;
        const twinkleDelay = (Math.random()*4).toFixed(2);
        return `<circle cx="${sx.toFixed(1)}%" cy="${sy.toFixed(1)}%" r="${sr.toFixed(1)}"
          fill="white" opacity="${sop.toFixed(2)}">
          <animate attributeName="opacity"
            values="${sop.toFixed(2)};${(sop*0.3).toFixed(2)};${sop.toFixed(2)}"
            dur="${(2+Math.random()*3).toFixed(1)}s" begin="${twinkleDelay}s" repeatCount="indefinite"/>
        </circle>`;
      }).join('');

      // Moon position: upper-left
      const moonSvg = `<svg xmlns="http://www.w3.org/2000/svg"
        style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
        ${starSvg}
        <!-- Moon outer glow (large diffuse) -->
        <defs>
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(200,215,255,0.22)"/>
            <stop offset="40%" stop-color="rgba(180,200,255,0.10)"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
          <radialGradient id="moonSurface" cx="45%" cy="42%" r="55%">
            <stop offset="0%" stop-color="#f0f4ff"/>
            <stop offset="60%" stop-color="#c8d8f8"/>
            <stop offset="100%" stop-color="#a0b8e8"/>
          </radialGradient>
          <filter id="moonShadow"><feGaussianBlur stdDeviation="6"/></filter>
        </defs>
        <!-- Glow halo -->
        <circle cx="12%" cy="14%" r="120" fill="url(#moonGlow)" filter="url(#moonShadow)"/>
        <!-- Moon disc -->
        <circle cx="12%" cy="14%" r="54" fill="url(#moonSurface)" opacity="0.92"/>
        <!-- Crescent shadow (slightly offset circle to carve crescent) -->
        <circle cx="17%" cy="12%" r="48"
          fill="${isMidnight ? '#02040e' : '#04071a'}" opacity="0.88"/>
        <!-- Crater details -->
        <circle cx="9%" cy="17%" r="5" fill="rgba(160,180,220,0.35)"/>
        <circle cx="14%" cy="11%" r="3.5" fill="rgba(140,165,210,0.30)"/>
        <circle cx="11%" cy="14%" r="2" fill="rgba(180,200,240,0.25)"/>
        <!-- Moon rim highlight -->
        <circle cx="12%" cy="14%" r="54" fill="none"
          stroke="rgba(220,230,255,0.25)" stroke-width="1.5"/>
      </svg>`;

      const moonEl = document.createElement('div');
      moonEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
      moonEl.innerHTML = moonSvg;
      fx.appendChild(moonEl);
    }

    //  NIGHT PARTICLE SHIMMER (floating dust) 
    if(cv){
      const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
      for(let i=0;i<35;i++) parts.push({
        x:Math.random()*W, y:Math.random()*H,
        r:0.5+Math.random()*1.2, spd:0.1+Math.random()*.3,
        op:0, maxOp:0.08+Math.random()*.18, ph:Math.random()*Math.PI*2
      });
      const drawNight=()=>{
        ctx.clearRect(0,0,W,H); const t=Date.now()/1000;
        parts.forEach(p=>{
          p.op=p.maxOp*(.5+.5*Math.sin(t*.5+p.ph));
          p.y-=p.spd*.3; if(p.y<-5){p.y=H+5;p.x=Math.random()*W;}
          ctx.save(); ctx.globalAlpha=p.op;
          ctx.fillStyle='rgba(180,200,255,1)';
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
          ctx.restore();
        });
        animId=requestAnimationFrame(drawNight);
      };
      drawNight();
    }
    return; // Night takes priority — skip weather-specific anim below
  }

  //  DAY: normal weather themes 
  applyWxTheme(code, tempC||20);
  const cv=document.getElementById('wx-canvas');if(!cv)return;
  cv.width=window.innerWidth; cv.height=window.innerHeight;
  const ctx=cv.getContext('2d'), fx=document.getElementById('wx-fx');
  const W=cv.width, H=cv.height;

  //  THUNDERSTORM 
  if(code>=95){
    // Heavy rain — dense, fast, dramatic
    for(let i=0;i<350;i++) parts.push({
      x:Math.random()*W, y:Math.random()*H,
      len:14+Math.random()*22, spd:18+Math.random()*14,
      op:0.25+Math.random()*.55, w:0.8+Math.random()*1.2,
      drift: -0.22
    });
    // Lightning overlay + bolts
    if(fx){
      const flash=document.createElement('div');
      flash.className='lightning-flash'; fx.appendChild(flash);
      // 2-3 lightning bolt divs at random positions
      for(let b=0;b<3;b++){
        const bolt=document.createElement('div');
        bolt.className='lightning-bolt';
        bolt.style.cssText=`left:${20+Math.random()*60}%;top:0;height:${30+Math.random()*40}%;
          animation-delay:${b*0.9}s;animation-duration:${2.5+b*0.4}s;
          transform:rotate(${-5+Math.random()*10}deg)`;
        fx.appendChild(bolt);
      }
    }
    const drawStorm=()=>{
      ctx.clearRect(0,0,W,H);
      parts.forEach(p=>{
        ctx.save(); ctx.globalAlpha=p.op;
        ctx.strokeStyle='rgba(180,210,255,.98)';
        ctx.lineWidth=p.w;
        ctx.beginPath(); ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x+p.len*p.drift, p.y+p.len);
        ctx.stroke(); ctx.restore();
        p.y+=p.spd; p.x+=p.spd*p.drift;
        if(p.y>H+20){p.y=-20;p.x=Math.random()*W;}
      });
      animId=requestAnimationFrame(drawStorm);
    };
    drawStorm(); return;
  }

  //  HEAVY RAIN — bright silver-blue streaks on dark navy 
  if((code>=61&&code<=67)||(code>=80&&code<=82)){
    for(let i=0;i<300;i++) parts.push({
      x:Math.random()*W, y:Math.random()*H,
      len:16+Math.random()*22, spd:15+Math.random()*12,
      op:0.55+Math.random()*.40, w:1.0+Math.random()*1.2
    });
    const drawHeavyRain=()=>{
      ctx.clearRect(0,0,W,H);
      parts.forEach(p=>{
        ctx.save(); ctx.globalAlpha=p.op;
        const grad=ctx.createLinearGradient(p.x,p.y,p.x-p.len*.20,p.y+p.len);
        grad.addColorStop(0,'rgba(180,220,255,.55)');
        grad.addColorStop(0.5,'rgba(140,200,255,.90)');
        grad.addColorStop(1,'rgba(100,170,255,1.0)');
        ctx.strokeStyle=grad; ctx.lineWidth=p.w;
        ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x-p.len*.20, p.y+p.len);
        ctx.stroke(); ctx.restore();
        p.y+=p.spd; p.x-=p.spd*.20;
        if(p.y>H+20){p.y=-20;p.x=Math.random()*W;}
      });
      animId=requestAnimationFrame(drawHeavyRain);
    };
    drawHeavyRain(); return;
  }

  //  LIGHT RAIN / DRIZZLE — visible on dark bg 
  if((code>=51&&code<=57)){
    for(let i=0;i<200;i++) parts.push({
      x:Math.random()*W, y:Math.random()*H,
      len:8+Math.random()*14, spd:7+Math.random()*7,
      op:0.45+Math.random()*.40, w:0.7+Math.random()*.8
    });
    const drawDrizzle=()=>{
      ctx.clearRect(0,0,W,H);
      parts.forEach(p=>{
        ctx.save(); ctx.globalAlpha=p.op;
        ctx.strokeStyle='rgba(160,210,255,.95)';
        ctx.lineWidth=p.w; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x-p.len*.12, p.y+p.len);
        ctx.stroke(); ctx.restore();
        p.y+=p.spd; p.x-=p.spd*.12;
        if(p.y>H+20){p.y=-20;p.x=Math.random()*W;}
      });
      animId=requestAnimationFrame(drawDrizzle);
    };
    drawDrizzle(); return;
  }

  //  SNOW — white flakes on icy blue-white sky 
  if((code>=71&&code<=77)||(code>=85&&code<=86)){
    // Mix of large and tiny flakes for depth
    for(let i=0;i<180;i++) parts.push({
      x:Math.random()*W, y:Math.random()*H,
      r:i<40 ? 4+Math.random()*6 : 1.5+Math.random()*3.5,
      spd:i<40 ? 1.2+Math.random()*2.0 : 0.6+Math.random()*1.4,
      dr:(Math.random()-.5)*0.9, op:i<40 ? 0.75+Math.random()*.20 : 0.55+Math.random()*.35,
      wb:Math.random()*Math.PI*2, wbSpd:0.006+Math.random()*.016,
      layer:i<40?'big':'small'
    });
    const drawSnow=()=>{
      ctx.clearRect(0,0,W,H);
      // Draw small flakes first (background), big on top
      ['small','big'].forEach(layer=>{
        parts.filter(p=>p.layer===layer).forEach(p=>{
          p.wb+=p.wbSpd;
          const wx=p.x+Math.sin(p.wb)*2.5;
          ctx.save(); ctx.globalAlpha=p.op;
          ctx.fillStyle='rgba(255,255,255,1)';
          ctx.shadowColor='rgba(160,210,255,.80)';
          ctx.shadowBlur=layer==='big'?10:5;
          ctx.beginPath(); ctx.arc(wx,p.y,p.r,0,Math.PI*2); ctx.fill();
          ctx.restore();
          p.y+=p.spd; p.x+=p.dr;
          if(p.y>H+10){p.y=-10;p.x=Math.random()*W;}
          if(p.x>W+10)p.x=-10; if(p.x<-10)p.x=W+10;
        });
      });
      animId=requestAnimationFrame(drawSnow);
    };
    drawSnow(); return;
  }

  //  CLEAR / SUNNY — sky blue + corner sunshine 
  if(code===0 || (code<=2 && tempC>=28)){
    if(fx){
      // Big sun orb in top-right corner (partially off-screen)
      const orb=document.createElement('div');
      orb.className='sun-orb';
      orb.style.cssText=`position:absolute;width:460px;height:460px;top:-140px;right:-100px;
        background:radial-gradient(circle,rgba(255,255,220,1) 0%,rgba(255,240,120,.85) 20%,rgba(255,210,60,.55) 45%,rgba(255,190,30,.22) 65%,transparent 80%);
        border-radius:50%;`;
      fx.appendChild(orb);
      // Pulsing inner disc
      const core=document.createElement('div');
      core.className='sun-core';
      core.style.cssText=`position:absolute;width:160px;height:160px;top:130px;left:130px;
        background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(255,245,120,.90) 35%,rgba(255,210,40,.65) 65%,transparent 90%);
        border-radius:50%;`;
      orb.appendChild(core);
      // Slow-rotating outer rays ring
      const rays=document.createElement('div');
      rays.className='sun-rays';
      rays.style.cssText=`position:absolute;width:300px;height:300px;top:60px;left:60px;
        border:2px dashed rgba(255,230,60,.40);border-radius:50%;`;
      orb.appendChild(rays);
      // Second larger dim ring
      const rays2=document.createElement('div');
      rays2.className='sun-rays';
      rays2.style.cssText=`position:absolute;width:380px;height:380px;top:20px;left:20px;
        border:1px dashed rgba(255,220,50,.20);border-radius:50%;animation-duration:35s;`;
      orb.appendChild(rays2);
    }
    // Light sparkle particles drifting upward across the blue sky
    for(let i=0;i<60;i++) parts.push({
      x:Math.random()*W, y:Math.random()*H,
      r:1+Math.random()*2.8, spd:0.4+Math.random()*.8,
      op:0, maxOp:0.22+Math.random()*.40, ph:Math.random()*Math.PI*2
    });
    const drawSun=()=>{
      ctx.clearRect(0,0,W,H);
      const t=Date.now()/1000;
      parts.forEach(p=>{
        p.op=p.maxOp*(.4+.6*Math.sin(t*.6+p.ph));
        p.y-=p.spd*.5; p.x+=Math.sin(t*.35+p.ph)*.6;
        if(p.y<-10){p.y=H+10;p.x=Math.random()*W;}
        ctx.save(); ctx.globalAlpha=p.op;
        ctx.fillStyle='rgba(255,248,180,1)';
        ctx.shadowColor='rgba(255,230,80,.85)'; ctx.shadowBlur=12;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });
      animId=requestAnimationFrame(drawSun);
    };
    drawSun(); return;
  }

  //  PARTLY CLOUDY 
  if(code<=2){
    if(fx){
      const orb=document.createElement('div');
      orb.className='sun-orb';
      orb.style.cssText=`width:200px;height:200px;top:-50px;right:20px;
        background:radial-gradient(circle,rgba(255,220,80,.32) 0%,rgba(255,180,20,.15) 50%,transparent 75%);`;
      fx.appendChild(orb);
    }
    for(let i=0;i<30;i++) parts.push({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*2,spd:.15+Math.random()*.3,op:0,maxOp:.10+Math.random()*.18,ph:Math.random()*Math.PI*2});
    const drawPartly=()=>{
      ctx.clearRect(0,0,W,H); const t=Date.now()/1000;
      parts.forEach(p=>{
        p.op=p.maxOp*(.5+.5*Math.sin(t*.5+p.ph)); p.y-=p.spd*.3;
        if(p.y<-10){p.y=H+10;p.x=Math.random()*W;}
        ctx.save(); ctx.globalAlpha=p.op; ctx.fillStyle='rgba(255,230,100,1)';
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.restore();
      });
      animId=requestAnimationFrame(drawPartly);
    };
    drawPartly(); return;
  }

  //  FOG 
  if(code>=45&&code<=49){
    if(fx){
      for(let i=0;i<7;i++){
        const fog=document.createElement('div');
        fog.className='fog-layer';
        const h2=80+i*40;
        fog.style.cssText=`height:${h2}px;top:${8+i*13}%;
          background:linear-gradient(to right,transparent,rgba(180,190,210,${.35+i*.04}) 25%,rgba(180,190,210,${.50+i*.03}) 50%,rgba(180,190,210,${.35+i*.04}) 75%,transparent);
          animation-duration:${20+i*8}s;animation-delay:${-i*5}s;opacity:${.55+i*.04}`;
        fx.appendChild(fog);
      }
    }
    return;
  }

  //  OVERCAST/WIND — animated wind lines on white-grey sky 
  if(code===3){
    if(fx){
      // Many wind streaks: thin curved lines at various heights, speeds, sizes
      for(let i=0;i<28;i++){
        const streak=document.createElement('div');
        streak.className='wind-streak';
        const wid=120+Math.random()*280;
        const speed=1.8+Math.random()*2.5;
        streak.style.cssText=`top:${Math.random()*100}%;width:${wid}px;height:${1.5+Math.random()*3}px;
          --wc:rgba(20,70,190,${.50+Math.random()*.42});
          animation-duration:${speed}s;
          animation-delay:${-Math.random()*speed}s;
          opacity:${.65+Math.random()*.30};
          border-radius:4px;`;
        fx.appendChild(streak);
      }
    }
    // Very subtle cloud drift particles in background
    for(let i=0;i<14;i++) parts.push({x:Math.random()*W,y:Math.random()*H,r:5+Math.random()*14,op:0.04+Math.random()*.05,ph:Math.random()*Math.PI*2});
    const drawOvercast=()=>{
      ctx.clearRect(0,0,W,H); const t=Date.now()/1000;
      parts.forEach(p=>{
        const op=p.op*(.5+.5*Math.sin(t*.2+p.ph)); p.x+=.35;
        if(p.x>W+30)p.x=-30;
        ctx.save(); ctx.globalAlpha=op; ctx.fillStyle='rgba(80,110,160,.9)';
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.restore();
      });
      animId=requestAnimationFrame(drawOvercast);
    };
    drawOvercast();
  }
}
window.addEventListener('resize',()=>{const cv=document.getElementById('wx-canvas');if(cv&&!document.getElementById('weather-page').classList.contains('hidden')){cv.width=window.innerWidth;cv.height=window.innerHeight;}});

// ALERTS
function genAlerts({temp,hum,wind,uv,code,vis}){
  const wrap=document.getElementById('alerts-wrap');if(!wrap)return;
  const list=[];
  if(code>=95)list.push({sev:'extreme',icon:'',title:'Thunderstorm Warning',desc:'Active thunderstorm. Avoid open areas, tall trees and metal structures. Seek shelter immediately.',meta:'Issued from current weather conditions'});
  if((code>=63&&code<=67)||(code>=81&&code<=82))list.push({sev:'severe',icon:'',title:'Heavy Rain & Flood Advisory',desc:'Intense rainfall may cause flash flooding. Avoid low-lying areas and flooded roads.',meta:'Flash flood watch in effect'});
  if(wind>=60)list.push({sev:'severe',icon:'',title:'Dust Storm & Severe Wind Warning',desc:`Winds at ${wind} km/h. Dust storms likely. Stay indoors and close windows.`,meta:'High wind advisory in effect'});
  else if(wind>=40)list.push({sev:'moderate',icon:'',title:'Strong Wind Advisory',desc:`Gusty winds up to ${wind} km/h. Caution outdoors near tall structures.`,meta:'Wind advisory issued'});
  if(temp>=45)list.push({sev:'extreme',icon:'',title:'Extreme Heat Emergency',desc:`Temperature at ${temp}°C — life-threatening. Stay indoors, stay hydrated, seek air conditioning.`,meta:'Heat emergency — IMD advisory'});
  else if(temp>=40)list.push({sev:'severe',icon:'',title:'Heat Wave Warning',desc:`Heat wave at ${temp}°C. Avoid outdoor activity 11AM–4PM. Drink 3+ litres of water daily.`,meta:'Heat wave advisory in effect'});
  else if(temp>=36&&hum>=60)list.push({sev:'moderate',icon:'',title:'Heat & Humidity Advisory',desc:`Hot and humid (${temp}°C, ${hum}% humidity). Limit exertion outdoors. Wear light clothing.`,meta:'Humid heat advisory'});
  if(temp<=2)list.push({sev:'severe',icon:'',title:'Cold Wave Warning',desc:`Temperature at ${temp}°C. Layer up. Check on elderly neighbours.`,meta:'Cold wave advisory in effect'});
  else if(temp<=8)list.push({sev:'moderate',icon:'',title:'Cold Wave Advisory',desc:`Cold conditions at ${temp}°C. Keep children and elderly warm. Watch for icy surfaces.`,meta:'Cold conditions advisory'});
  if((code>=45&&code<=49)||vis<1)list.push({sev:'moderate',icon:'',title:'Dense Fog Advisory',desc:`Visibility ${vis<1?'below 1 km':vis+' km'}. Drive slowly with headlights on.`,meta:'Visibility advisory issued'});
  if(code>=71&&code<=77)list.push({sev:'moderate',icon:'',title:'Snowfall Advisory',desc:'Snowfall may disrupt roads and create slippery surfaces.',meta:'Winter weather advisory'});
  if(uv>=11)list.push({sev:'severe',icon:'',title:'Extreme UV Warning',desc:`UV Index at ${uv} — extreme. SPF 50+, cover up, avoid 10AM–4PM sun.`,meta:'UV radiation advisory'});
  else if(uv>=8)list.push({sev:'moderate',icon:'',title:'High UV Advisory',desc:`UV Index at ${uv} — very high. Apply SPF 30+ and wear a hat outdoors.`,meta:'UV advisory'});
  if(hum>=90&&temp>=28)list.push({sev:'minor',icon:'',title:'Very High Humidity Notice',desc:`Humidity at ${hum}% makes conditions feel significantly worse.`,meta:'Humidity notice'});

  if(!list.length){wrap.innerHTML='<div class="alert-safe"><span style="font-size:18px"></span> No active weather alerts — conditions look safe right now.</div>';return;}
  const ord={extreme:0,severe:1,moderate:2,minor:3};
  list.sort((a,b)=>ord[a.sev]-ord[b.sev]);
  wrap.innerHTML=list.map((al,i)=>`<div class="alert-banner ${al.sev}" style="animation-delay:${i*.07}s"><div class="alert-icon">${al.icon}</div><div><div class="alert-title">${al.title}</div><div class="alert-desc">${al.desc}</div><div class="alert-meta">${al.meta}</div></div><button class="alert-close" onclick="this.closest('.alert-banner').remove()">×</button></div>`).join('');
}

// NAVIGATION
function showPage(id){
  ['home','weather-page','compare-page','favs-page'].forEach(p=>document.getElementById(p).classList.toggle('hidden',p!==id));
  document.getElementById('compare-nav-btn').classList.toggle('active',id==='compare-page');
  document.getElementById('favs-nav-btn').classList.toggle('active',id==='favs-page');
  if(id==='weather-page')document.querySelector('.weather-content').scrollTop=0;
  if(id==='compare-page')document.querySelector('.compare-content').scrollTop=0;
  if(id==='favs-page'){document.getElementById('favs-page-content').scrollTop=0;buildFavsPage();}
}
function showHome(){stopWxAnim();stopCityClock();document.body.classList.remove('tod-dawn','tod-morning','tod-day','tod-afternoon','tod-sunset','tod-dusk','tod-night','tod-midnight');document.getElementById('search-input').value='';document.getElementById('suggestions').style.display='none';showPage('home');}
function showComparePage(){showPage('compare-page');}
function showFavsPage(){showPage('favs-page');}

// COMPARE
const cpData={},cpSugs={1:[],2:[]},cpTimers={1:null,2:null};

async function csSuggest(slot,q){
  clearTimeout(cpTimers[slot]);
  const el=document.getElementById('cs-sug-'+slot);
  if(!q||q.length<2){el.style.display='none';return;}
  cpTimers[slot]=setTimeout(async()=>{
    try{
      const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
      const data=await r.json();cpSugs[slot]=data.results||[];
      if(!cpSugs[slot].length){el.style.display='none';return;}
      el.innerHTML=cpSugs[slot].map((s,i)=>`<div class="sug-item" onclick="cpPickSug(${slot},${i})"><span></span><span style="font-weight:500">${s.name}</span><span class="sug-country">${s.admin1?s.admin1+', ':''}${s.country}</span></div>`).join('');
      el.style.display='block';
    }catch{el.style.display='none';}
  },320);
}

function cpPickSug(slot,i){
  const s=cpSugs[slot][i];
  document.getElementById('cs-input-'+slot).value=s.name;
  document.getElementById('cs-sug-'+slot).style.display='none';
  cpLoad(slot,s.latitude,s.longitude,s.name,s.country||'',s.admin1||'');
}

async function csSearch(slot){
  const q=document.getElementById('cs-input-'+slot).value.trim();
  if(!q)return;
  document.getElementById('cs-sug-'+slot).style.display='none';
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    const data=await r.json();
    if(!data.results?.length){toast('City not found.');return;}
    const s=data.results[0];cpLoad(slot,s.latitude,s.longitude,s.name,s.country||'',s.admin1||'');
  }catch{toast('Search failed.');}
}

async function cpLoad(slot,lat,lng,city,country,state){
  document.getElementById('cp-'+slot).innerHTML=`<div class="cp-empty"><div class="cp-empty-icon" style="animation:locPulse 1s ease-in-out infinite"></div><div class="cp-empty-text">Loading ${city}…</div></div>`;
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index,surface_pressure,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
    const r=await fetch(url);const d=await r.json();
    cpData[slot]={d,city,country,state,lat,lng};renderCp(slot);
    if(cpData[1]&&cpData[2])renderWinner();
  }catch{document.getElementById('cp-'+slot).innerHTML=`<div class="cp-empty"><div class="cp-empty-icon"></div><div class="cp-empty-text">Failed to load.</div></div>`;}
}

function renderCp(slot){
  const{d,city,country,state,lat,lng}=cpData[slot],c=d.current,w=wCode(c.weather_code);
  const temp=Math.round(c.temperature_2m),feels=Math.round(c.apparent_temperature),wind=Math.round(c.wind_speed_10m),uv=c.uv_index,hum=c.relative_humidity_2m,vis=(c.visibility/1000).toFixed(1);
  const strip=d.daily.weather_code.slice(0,7).map((code,i)=>{const fw=wCode(code);return`<div class="cfs"><div class="cfs-day">${i===0?'Now':DAYS[new Date(d.daily.time[i]).getDay()]}</div><div class="cfs-icon">${fw.icon}</div><div class="cfs-hi">${Math.round(d.daily.temperature_2m_max[i])}°</div><div class="cfs-lo">${Math.round(d.daily.temperature_2m_min[i])}°</div></div>`;}).join('');
  const safeCity=city.replace(/'/g,"\\'");
  document.getElementById('cp-'+slot).innerHTML=`<div class="cp-icon">${w.icon}</div><div class="cp-city">${city}</div><div class="cp-meta">${state?state+' · ':''}${country}</div><div class="cp-temp">${temp}<sup>°C</sup></div><div class="cp-condition">${w.label}</div><div id="cp-badge-${slot}"></div><div class="cp-stats"><div class="cp-stat"><div class="cp-stat-label">Humidity</div><div class="cp-stat-value">${hum}<span class="cp-stat-unit">%</span></div></div><div class="cp-stat"><div class="cp-stat-label">Wind</div><div class="cp-stat-value">${wind}<span class="cp-stat-unit">km/h</span></div></div><div class="cp-stat"><div class="cp-stat-label">UV</div><div class="cp-stat-value">${uv}<span class="cp-stat-unit">/ 11</span></div></div><div class="cp-stat"><div class="cp-stat-label">Visibility</div><div class="cp-stat-value">${vis}<span class="cp-stat-unit">km</span></div></div><div class="cp-stat"><div class="cp-stat-label">Feels Like</div><div class="cp-stat-value">${feels}<span class="cp-stat-unit">°C</span></div></div><div class="cp-stat"><div class="cp-stat-label">Pressure</div><div class="cp-stat-value">${Math.round(c.surface_pressure)}<span class="cp-stat-unit">hPa</span></div></div></div><div class="cp-strip">${strip}</div><div style="text-align:center;margin-top:10px"><button class="cp-view-btn" onclick="loadWeather(${lat},${lng},'${safeCity}','${country}','${state}')">Full forecast →</button></div>`;
}

function renderWinner(){
  const a=cpData[1].d.current,b=cpData[2].d.current;
  let sA=0,sB=0;
  if(Math.round(a.temperature_2m)>Math.round(b.temperature_2m))sA++;else sB++;
  if(Math.round(a.wind_speed_10m)<Math.round(b.wind_speed_10m))sA++;else sB++;
  if(a.uv_index<b.uv_index)sA++;else sB++;
  if(a.visibility>b.visibility)sA++;else sB++;
  if(a.relative_humidity_2m<b.relative_humidity_2m)sA++;else sB++;
  const winner=sA>sB?1:sA<sB?2:0;
  [1,2].forEach(s=>{const el=document.getElementById('cp-badge-'+s);if(!el)return;if(winner===s)el.innerHTML='<div class="winner-badge"> Better conditions today</div>';else if(winner===0&&s===1)el.innerHTML='<div class="winner-badge" style="opacity:.6"> Similar conditions</div>';else el.innerHTML='';});
}

document.addEventListener('click',e=>{
  [1,2].forEach(slot=>{const box=document.getElementById('cs-box-'+slot);const sug=document.getElementById('cs-sug-'+slot);if(box&&sug&&!box.contains(e.target))sug.style.display='none';});
});


//  FAVOURITES 
function getFavs(){try{return JSON.parse(localStorage.getItem('skycast_favs')||'[]');}catch{return[];}}
function saveFavs(arr){try{localStorage.setItem('skycast_favs',JSON.stringify(arr));}catch{}}
function isFav(city,lat,lng){return getFavs().some(f=>f.city===city&&Math.abs(f.lat-lat)<0.01&&Math.abs(f.lng-lng)<0.01);}

function syncStar(city,lat,lng){
  const btn=document.getElementById('star-btn');
  if(!btn)return;
  const fav=isFav(city,lat,lng);
  btn.textContent=fav?'Saved':'Save';
  btn.classList.toggle('saved', fav);
}

function toggleFav(){
  if(!wxData)return;
  const favs=getFavs();
  const exists=isFav(wxCity,wxLat,wxLng);
  if(exists){
    saveFavs(favs.filter(f=>!(f.city===wxCity&&Math.abs(f.lat-wxLat)<0.01)));
    toast('Removed from favourites');
  } else {
    favs.push({city:wxCity,country:wxCountry,state:wxState,lat:wxLat,lng:wxLng,temp:Math.round(wxData.current.temperature_2m),icon:wCode(wxData.current.weather_code).icon,code:wxData.current.weather_code});
    saveFavs(favs);
    toast('Added to favourites!');
  }
  syncStar(wxCity,wxLat,wxLng);
}

function clearAllFavs(){
  if(!getFavs().length)return;
  saveFavs([]);
  syncStar(wxCity,wxLat,wxLng);
  buildFavsPage();
  toast('All favourites cleared');
}

function removeFavByIdx(i){
  const favs=getFavs();favs.splice(i,1);saveFavs(favs);
  syncStar(wxCity,wxLat,wxLng);
  buildFavsPage();
}

async function buildFavsPage(){
  const wrap=document.getElementById('favs-grid-wrap');
  const tsEl=document.getElementById('favs-last-updated');
  if(!wrap)return;
  const favs=getFavs();

  if(!favs.length){
    wrap.innerHTML=`<div class="favs-empty-state">
      <div class="empty-icon"></div>
      <h3>No favourites yet</h3>
      <p>Search for a city and tap the  star icon on the weather page to save it here.</p>
      <button onclick="showHome()">Explore the map</button>
    </div>`;
    if(tsEl)tsEl.textContent='';
    return;
  }

  wrap.innerHTML='<div class="favs-grid" id="favs-grid">'+favs.map((_,i)=>`
    <div class="fav-card fav-card-loading" id="fcard-${i}" style="animation-delay:${i*.07}s">
      <div class="fav-card-loading-inner">
        <div class="skeleton" style="height:22px;width:55%;border-radius:8px"></div>
        <div class="skeleton" style="height:13px;width:35%;border-radius:6px;margin-top:6px"></div>
        <div class="skeleton" style="height:58px;width:48%;border-radius:8px;margin-top:10px"></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
          ${Array(3).fill('<div class="skeleton" style="height:44px;border-radius:8px"></div>').join('')}
        </div>
      </div>
    </div>`).join('')+'</div>';

  const results = await Promise.allSettled(favs.map(async(f,i)=>{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${f.lat}&longitude=${f.lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto`;
    const r=await fetch(url);return{data:await r.json(),idx:i,fav:f};
  }));

  results.forEach(res=>{
    if(res.status!=='fulfilled')return;
    const{data:d,idx:i,fav:f}=res.value;
    const cur=d.current,w=wCode(cur.weather_code);
    const liveTemp=Math.round(cur.temperature_2m);
    const suf=unitSuffix(currentUnit);

    const stored=getFavs();
    if(stored[i]){stored[i].temp=liveTemp;stored[i].icon=w.icon;stored[i].code=cur.weather_code;saveFavs(stored);}

    const strip=d.daily.weather_code.slice(0,5).map((code,di)=>{
      const fw=wCode(code);const day=di===0?'Now':DAYS[new Date(d.daily.time[di]).getDay()];
      return`<div class="fcd"><div class="fcd-day">${day}</div><div class="fcd-icon">${fw.icon}</div><div class="fcd-hi">${cvtTemp(d.daily.temperature_2m_max[di],currentUnit)}°</div><div class="fcd-lo">${cvtTemp(d.daily.temperature_2m_min[di],currentUnit)}°</div></div>`;
    }).join('');

    const card=document.getElementById('fcard-'+i);
    if(!card)return;
    card.className='fav-card';
    card.onclick=()=>loadWeather(f.lat,f.lng,f.city,f.country,f.state||'');
    card.innerHTML=`
      <button class="fav-card-remove" onclick="event.stopPropagation();removeFavByIdx(${i})">×</button>
      <div class="fav-card-header">
        <div><div class="fav-card-city">${f.city}</div><div class="fav-card-meta">${f.state?f.state+' · ':''}${f.country}</div></div>
        <div class="fav-card-icon">${w.icon}</div>
      </div>
      <div class="fav-card-temp">${cvtTemp(liveTemp,currentUnit)}<sup>${suf}</sup></div>
      <div class="fav-card-condition">${w.label}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:3px">Feels like ${cvtTemp(Math.round(cur.apparent_temperature),currentUnit)}${suf}</div>
      <div class="fav-card-stats">
        <div class="fav-card-stat"><div class="fav-card-stat-label">Humidity</div><div class="fav-card-stat-value">${cur.relative_humidity_2m}%</div></div>
        <div class="fav-card-stat"><div class="fav-card-stat-label">Wind</div><div class="fav-card-stat-value">${Math.round(cur.wind_speed_10m)}<span style="font-size:9px;color:var(--muted)"> km/h</span></div></div>
        <div class="fav-card-stat"><div class="fav-card-stat-label">UV</div><div class="fav-card-stat-value">${cur.uv_index}</div></div>
      </div>
      <div class="fav-card-forecast">${strip}</div>`;
  });

  if(tsEl)tsEl.textContent='Updated just now · '+favs.length+' saved cit'+(favs.length===1?'y':'ies');
}


//  RECENT SEARCHES 
const RECENT_KEY = 'skycast_recent';
const MAX_RECENT = 6;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(arr) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch {}
}

function addToRecent(city, country, state, lat, lng, icon, temp) {
  let recent = getRecent();
  // Remove duplicate entry for same city
  recent = recent.filter(r => !(r.city === city && Math.abs(r.lat - lat) < 0.05));
  // Add to front
  recent.unshift({ city, country, state, lat, lng, icon: icon || '', temp, ts: Date.now() });
  // Keep only MAX_RECENT
  recent = recent.slice(0, MAX_RECENT);
  saveRecent(recent);
  renderRecentBar();
}

function renderRecentBar() {
  const bar = document.getElementById('recent-bar');
  if (!bar) return;
  const recent = getRecent();
  if (!recent.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  const rows = recent.map(r => `
    <button class="recent-chip"
      onclick="loadWeather(${r.lat},${r.lng},'${r.city.replace(/'/g,"\\'")}','${r.country}','${r.state||''}')">
      <span class="recent-chip-icon">${r.icon}</span>
      <span class="recent-chip-name">${r.city}</span>
      ${r.temp !== undefined ? `<span class="recent-chip-temp">${r.temp}°</span>` : ''}
    </button>`).join('');
  bar.innerHTML = `<div class="recent-panel">
    <div class="recent-panel-header">
      <span class="recent-label"> Recent</span>
      <button class="recent-clear" onclick="clearRecent()" title="Clear history">×</button>
    </div>
    <div class="recent-chips">${rows}</div>
  </div>`;
}
function clearRecent() {
  saveRecent([]);
  renderRecentBar();
}

// Init on load
renderRecentBar();

//  SHARE FORECAST 
function shareWeather() {
  if (!wxData) return;
  const c = wxData.current;
  const temp = Math.round(c.temperature_2m);
  const w = wCode(c.weather_code);
  const hum = c.relative_humidity_2m;
  const wind = Math.round(c.wind_speed_10m);
  const uv = c.uv_index;

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const text = `${wxCity} — ${today}\n${w.icon} ${temp}°C, ${w.label}\n Humidity: ${hum}%   Wind: ${wind} km/h   UV: ${uv}\n\nVia SkyCast `;

  // Try native share sheet first (mobile), fallback to clipboard
  if (navigator.share) {
    navigator.share({
      title: `${wxCity} Weather — SkyCast`,
      text: text,
      url: window.location.href
    }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text);
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showShareToast(' Copied to clipboard!'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showShareToast(' Copied to clipboard!');
  } catch {
    showShareToast(' Could not copy — try manually');
  }
  document.body.removeChild(ta);
}

function showShareToast(msg) {
  const el = document.getElementById('share-toast');
  const msgEl = document.getElementById('share-toast-msg');
  if (!el) return;
  if (msgEl) msgEl.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}


//  LIVE CITY CLOCK 
let clockInterval = null;

function startCityClock(tz) {
  if (clockInterval) clearInterval(clockInterval);
  function tick() {
    const el = document.getElementById('city-clock-time');
    const tzEl = document.getElementById('city-clock-tz');
    if (!el) { clearInterval(clockInterval); return; }
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true
      });
      el.textContent = timeStr;
      // Extract abbreviated timezone name
      const tzName = now.toLocaleTimeString('en-US', {
        timeZone: tz, timeZoneName: 'short'
      }).split(' ').pop();
      if (tzEl) tzEl.textContent = tzName;
    } catch {
      const fallback = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
      el.textContent = fallback;
    }
  }
  tick();
  clockInterval = setInterval(tick, 10000);
}

function stopCityClock() {
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

//  OUTFIT RECOMMENDATION 
function buildOutfitCard(tempC, hum, wind, uv, weatherCode) {
  const wrap = document.getElementById('outfit-wrap');
  if (!wrap) return;

  //  Clothing layer 
  let clothing = '', clothingIcon = '';
  if (tempC >= 38)       { clothing = 'Ultra-light, loose-fit clothing'; clothingIcon = ''; }
  else if (tempC >= 32)  { clothing = 'Light cotton shirt & shorts'; clothingIcon = ''; }
  else if (tempC >= 26)  { clothing = 'Breathable cotton top'; clothingIcon = ''; }
  else if (tempC >= 20)  { clothing = 'Light shirt or T-shirt with a layer'; clothingIcon = ''; }
  else if (tempC >= 14)  { clothing = 'Light jacket or hoodie'; clothingIcon = ''; }
  else if (tempC >= 8)   { clothing = 'Warm jacket & trousers'; clothingIcon = ''; }
  else if (tempC >= 2)   { clothing = 'Heavy coat & warm layers'; clothingIcon = ''; }
  else                   { clothing = 'Heavy winter coat, gloves & scarf'; clothingIcon = ''; }

  //  Footwear 
  let footwear = '', footwearIcon = '';
  const isRainy = weatherCode >= 51 && weatherCode <= 82;
  const isSnowy = weatherCode >= 71 && weatherCode <= 86;
  if (isSnowy)           { footwear = 'Waterproof snow boots'; footwearIcon = ''; }
  else if (isRainy)      { footwear = 'Waterproof shoes or rain boots'; footwearIcon = ''; }
  else if (tempC >= 28)  { footwear = 'Open sandals or light sneakers'; footwearIcon = ''; }
  else                   { footwear = 'Comfortable closed shoes'; footwearIcon = ''; }

  //  Rain gear 
  let rain = '', rainIcon = '';
  if (weatherCode >= 95)         { rain = 'Heavy-duty umbrella or raincoat'; rainIcon = ''; }
  else if (weatherCode >= 63)    { rain = 'Umbrella — heavy rain expected'; rainIcon = ''; }
  else if (weatherCode >= 51)    { rain = 'Carry a compact umbrella'; rainIcon = ''; }

  //  Accessories based on UV + humidity 
  const extras = [];
  if (uv >= 8)                   extras.push({ icon: '', text: 'Sunglasses' });
  if (uv >= 6 && tempC >= 24)    extras.push({ icon: '', text: `SPF ${uv >= 10 ? 50 : 30}+ sunscreen` });
  if (tempC >= 35)               extras.push({ icon: '', text: 'Sun hat or cap' });
  if (wind >= 40)                extras.push({ icon: '', text: 'Windproof jacket' });
  if (hum >= 80 && tempC >= 28)  extras.push({ icon: '', text: 'Stay hydrated' });
  if (tempC <= 8)                extras.push({ icon: '', text: 'Scarf & gloves' });
  if (weatherCode >= 45 && weatherCode <= 49) extras.push({ icon: '', text: 'Drive with headlights' });

  //  Headline sentence 
  let headline = '';
  if (weatherCode >= 95)         headline = 'Stay indoors if possible — severe storm conditions.';
  else if (weatherCode >= 80)    headline = 'Heavy showers — dress to stay dry.';
  else if (weatherCode >= 63)    headline = 'Rainy day — waterproof gear essential.';
  else if (weatherCode >= 51)    headline = 'Light rain possible — pack an umbrella.';
  else if (weatherCode >= 71)    headline = 'Snowy conditions — warm & waterproof layers.';
  else if (weatherCode >= 45)    headline = 'Dense fog — limited visibility today.';
  else if (tempC >= 40)          headline = 'Extreme heat — minimal clothing, maximum hydration.';
  else if (tempC >= 33 && uv >= 8) headline = 'Hot & sunny — sun protection is a must.';
  else if (tempC >= 28)          headline = 'Warm day — light & breathable is the way to go.';
  else if (tempC >= 20)          headline = 'Pleasant weather — easy dressing day.';
  else if (tempC >= 12)          headline = 'Mild and cool — a light layer is all you need.';
  else if (tempC >= 4)           headline = 'Cold today — bundle up before heading out.';
  else                           headline = 'Freezing conditions — full winter gear required.';

  //  Build chips 
  const chips = [
    { icon: clothingIcon, text: clothing },
    { icon: footwearIcon, text: footwear },
    ...(rain ? [{ icon: rainIcon, text: rain }] : []),
    ...extras.slice(0, 4)
  ];

  wrap.innerHTML = `<div class="outfit-card">
    <div class="outfit-header">
      <div class="outfit-header-icon"></div>
      <div>
        <div class="outfit-header-label">What to wear today</div>
        <div class="outfit-header-title">${headline}</div>
      </div>
    </div>
    <div class="outfit-items">
      ${chips.map(c => `<div class="outfit-chip"><span class="outfit-chip-icon">${c.icon}</span>${c.text}</div>`).join('')}
    </div>
    <div class="outfit-tip">
      <strong>Local tip:</strong>
      ${tempC >= 35
        ? 'Carry a water bottle and avoid outdoor activity between 11 AM – 4 PM.'
        : tempC <= 8
        ? 'Warm up with a hot drink before heading out. Beware of icy surfaces.'
        : weatherCode >= 51 && weatherCode <= 82
        ? 'Wet roads — allow extra time for your commute and watch for puddles.'
        : uv >= 8
        ? 'Apply sunscreen 20 minutes before going outside for best protection.'
        : wind >= 40
        ? 'Avoid open elevated areas — strong gusts can be unpredictable.'
        : 'Comfortable conditions — great day to spend time outdoors!'}
    </div>
  </div>`;
}

// TOAST
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3200);}
