"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, LeafletMouseEvent } from "leaflet";
import { LocateFixed, MapPin, CheckCircle2, RefreshCw } from "lucide-react";
import { locationPoint, type LocationPoint } from "../../lib/location-point";
import { Busy, Notice } from "../ui";

export function LocationPicker({ latitude, longitude }: { latitude?: string | null; longitude?: string | null }) {
  const initial = useRef(locationPoint(latitude, longitude));
  const [point, setPoint] = useState<LocationPoint | null>(initial.current);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const selected = useRef(point);
  const place = useRef<((point: LocationPoint, center?: boolean) => void) | null>(null);
  const generation = useRef(0);
  const hintId = useId();

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let instance: LeafletMap | undefined;
    setLoading(true);
    setMapError("");
    import("leaflet").then(L => {
      if (cancelled || !container.current) return;
      instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: true, maxZoom: 19 });
      map.current = instance;
      instance.setView(selected.current ? [selected.current.latitude, selected.current.longitude] : [30.0444, 31.2357], selected.current ? 16 : 6);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(instance);
      tiles.on("tileerror", () => { if (!cancelled) setMapError("بعض أجزاء الخريطة لم تتحمل. جرّب إعادة تحميل الخريطة؛ تحديد موقعك الحالي يظل متاحًا."); });
      const icon = L.divIcon({ className: "gym-location-pin", html: '<span aria-hidden="true"></span>', iconSize: [36, 44], iconAnchor: [18, 42] });
      const select = (next: LocationPoint, center = false) => {
        if (cancelled || !instance) return;
        selected.current = next;
        setPoint(next);
        setError("");
        if (!marker.current) {
          marker.current = L.marker([next.latitude, next.longitude], { draggable: true, icon, title: "مكان الفرع — اسحب الدبوس لتعديله", alt: "دبوس مكان الفرع" }).addTo(instance);
          marker.current.on("dragend", () => {
            const position = marker.current!.getLatLng().wrap();
            const moved = locationPoint(position.lat, position.lng);
            if (moved) { select(moved); setAccuracy(null); }
          });
        } else marker.current.setLatLng([next.latitude, next.longitude]);
        if (center) instance.setView([next.latitude, next.longitude], 17);
      };
      place.current = select;
      if (selected.current) select(selected.current);
      instance.on("click", (event: LeafletMouseEvent) => {
        const position = event.latlng.wrap();
        const next = locationPoint(position.lat, position.lng);
        if (next) { select(next); setAccuracy(null); }
      });
      observer = new ResizeObserver(() => instance?.invalidateSize());
      observer.observe(container.current);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setLoading(false); setMapError("تعذر فتح الخريطة. أعد المحاولة أو استخدم موقعك الحالي لو أنت في الفرع."); }
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.remove();
      map.current = null;
      marker.current = null;
      place.current = null;
    };
  }, [attempt]);

  useEffect(() => () => { generation.current++; }, []);

  function locate() {
    if (locating) return;
    setError("");
    if (!navigator.geolocation) { setError("الموقع مش متاح على جهازك؛ حدد مكان الفرع بالضغط على الخريطة."); return; }
    const current = ++generation.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (current !== generation.current) return;
      setLocating(false);
      const next = locationPoint(position.coords.latitude, position.coords.longitude);
      if (!next) { setError("تعذر تحديد مكان صالح. اختار المكان من الخريطة."); return; }
      selected.current = next;
      setPoint(next);
      setAccuracy(Math.round(position.coords.accuracy));
      place.current?.(next, true);
    }, failure => {
      if (current !== generation.current) return;
      setLocating(false);
      setError(failure.code === 1 ? "المتصفح لم يسمح بالموقع. تقدر تختار مكان الجيم من الخريطة، أو تسمح بالموقع من إعدادات المتصفح." : "تعذر تحديد مكانك. حاول تاني أو اختار المكان على الخريطة.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  return <section className="branch-location-picker" aria-label="مكان الفرع على الخريطة">
    <h3><MapPin size={19} />مكان الفرع</h3>
    <p className="muted" id={hintId}>لو أنت في الجيم، استخدم موقعك الحالي. أو حرّك الخريطة واضغط على مكان الفرع، وبعدها تقدر تسحب الدبوس لتظبطه.</p>
    <button type="button" className="secondary full location-detect" disabled={locating} onClick={locate}>{locating ? <Busy>بنحدد مكانك</Busy> : <><LocateFixed size={19} />استخدم موقعي الحالي</>}</button>
    <Notice text={error} />
    <div className="location-map-shell">
      <div ref={container} className="location-map" aria-label="خريطة تحديد مكان الفرع" aria-describedby={hintId} />
      {loading && <div className="location-map-loading"><Busy>جاري فتح الخريطة</Busy></div>}
    </div>
    <Notice text={mapError} />
    {mapError && <button type="button" className="text-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} />إعادة تحميل الخريطة</button>}
    <button type="button" className="text-button location-center" disabled={loading || !map.current} onClick={() => {
      const center = map.current?.getCenter().wrap();
      const next = center ? locationPoint(center.lat, center.lng) : null;
      if (next) { place.current?.(next); setAccuracy(null); }
    }}><MapPin size={16} />اختيار منتصف الخريطة</button>
    {point ? <p className="location-selected" role="status"><CheckCircle2 size={18} />تم تحديد مكان الفرع. تقدر تحرّك الدبوس قبل الحفظ.</p> : <p className="field-hint" role="status">لسه محددتش مكان الفرع؛ اختار نقطة على الخريطة قبل الحفظ.</p>}
    {accuracy !== null && <small className="muted">دقة الموقع تقريبًا {accuracy} متر؛ راجع الدبوس على مكان الجيم.</small>}
    <input type="hidden" name="latitude" value={locating ? "" : point?.latitude ?? ""} />
    <input type="hidden" name="longitude" value={locating ? "" : point?.longitude ?? ""} />
  </section>;
}
