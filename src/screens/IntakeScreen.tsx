import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScanLine,
  Car,
  Keyboard,
  Sparkles,
  Wrench,
  Gauge,
  Cog,
  Fuel,
  Camera,
  ChevronRight,
  Brain,
  TrendingUp,
  Boxes,
  Clock,
  DollarSign,
  AlertCircle,
  Flame,
  AlertTriangle,
  Info,
  ClipboardList,
  CarFront,
  CircuitBoard,
  Factory,
  Loader2,
  CameraOff,
  Palette,
  Settings2,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { Card, Badge, Button, formatCurrency } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { EstimateExplainer, WhyEstimateButton, SourceTag } from '@/components/EstimateExplainer';
import { demandColor, generateRevenueEstimate, generateDismantleParts } from '@/data';
import { decodeVin } from '@/vinDecoder';
import { toTitleCase } from '@/utils/textCase';
import { fetchVehicleConfig } from '@/shop/researchService';
import type { Screen, DismantlePart, RevenueEstimate, Vehicle, VehicleStore, EstimateBreakdown, VehicleStatusConfig, VehicleConfigOptions } from '@/types';

type DecodeStatus = 'idle' | 'loading' | 'success' | 'error';

interface DecodedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  color: string;
  mileage: number;
  engine: string;
  transmission: string;
  bodyStyle: string;
  driveType: string;
  fuelType: string;
  plant: string;
  estimatedValue: number;
  confidence: number;
  condition: string;
}

interface ManualVehicle {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  color: string;
  mileage: string;
}

const emptyManual: ManualVehicle = {
  year: '', make: '', model: '', trim: '', engine: '', transmission: '', color: '', mileage: '',
};

function makeVehicleId(): string {
  return crypto.randomUUID();
}

export function IntakeScreen({ onNavigate, store }: { onNavigate: (s: Screen) => void; store: VehicleStore }) {
  const [mode, setMode] = useState<'scan' | 'manual-vin' | 'manual-entry'>('scan');
  const [vin, setVin] = useState('');
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>('idle');
  const [decoded, setDecoded] = useState<DecodedVehicle | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [manual, setManual] = useState<ManualVehicle>(emptyManual);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [explainer, setExplainer] = useState<{ breakdown: EstimateBreakdown; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualSaved, setManualSaved] = useState(false);
  const [configStep, setConfigStep] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configOptions, setConfigOptions] = useState<VehicleConfigOptions | null>(null);
  const [factoryConfig, setFactoryConfig] = useState({
    exteriorColor: '', interiorColor: '', cabConfig: '', bedLength: '',
    infotainmentSystem: '', lightingOptions: '', seatConfig: '', rpoCodes: '', factoryOptions: '',
  });
  const [configSaved, setConfigSaved] = useState(false);

  const savedVehicle = store.selectedVehicle;
  const savedParts = savedVehicle
    ? generateDismantleParts(savedVehicle, store.orders)
    : [];
  const savedRevenue = savedVehicle
    ? generateRevenueEstimate(savedVehicle, savedParts)
    : null;

  const handleDecode = useCallback(async (vinToDecode?: string) => {
    const v = (vinToDecode || vin).trim().toUpperCase();
    if (v.length < 17) return;

    setDecodeStatus('loading');
    setDecoded(null);
    setErrorMessage('');

    try {
      const result = await decodeVin(v);
      const vehicle: DecodedVehicle = {
        vin: result.vin,
        year: result.year,
        make: toTitleCase(result.make),
        model: toTitleCase(result.model),
        trim: result.trim ? toTitleCase(result.trim) : result.trim,
        color: 'N/A',
        mileage: 0,
        engine: result.engine ? toTitleCase(result.engine) : result.engine,
        transmission: result.transmission ? toTitleCase(result.transmission) : result.transmission,
        bodyStyle: result.bodyStyle,
        driveType: result.driveType,
        fuelType: result.fuelType,
        plant: result.plant,
        estimatedValue: 0,
        confidence: result.confidence,
        condition: 'Good',
      };
      setDecoded(vehicle);

      const newVehicle: Vehicle = {
        id: makeVehicleId(),
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        color: vehicle.color,
        status: store.statusConfigs.find((c) => c.isDefault)?.slug ?? 'in-yard',
        location: 'Yard A · Row 4',
        intakeDate: new Date().toISOString().split('T')[0],
        estimatedValue: vehicle.estimatedValue,
        mileage: vehicle.mileage,
        engine: vehicle.engine,
        transmission: vehicle.transmission,
        bodyStyle: vehicle.bodyStyle,
        driveType: vehicle.driveType,
        fuelType: vehicle.fuelType,
        plant: vehicle.plant,
        condition: vehicle.condition,
        partsTotal: 0,
        partsPulled: 0,
        dataSource: 'nhtsa',
      };
      await store.addVehicle(newVehicle);
      setDecodeStatus('success');
      setConfigStep(true);
      setConfigSaved(false);
      // Fetch factory config options in the background
      setConfigLoading(true);
      try {
        const opts = await fetchVehicleConfig({
          vin: vehicle.vin, year: vehicle.year, make: vehicle.make,
          model: vehicle.model, trim: vehicle.trim, engine: vehicle.engine, bodyStyle: vehicle.bodyStyle,
        });
        setConfigOptions(opts);
      } catch {
        // Non-blocking — user can still enter manually
      } finally {
        setConfigLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decode failed';
      setErrorMessage(msg);
      setDecodeStatus('error');
    }
  }, [vin, store]);

  const handleManualSubmit = async () => {
    if (saving || manualSaved) return;
    if (!manual.year || !manual.make || !manual.model) return;
    setSaving(true);
    try {
      const newVehicle: Vehicle = {
        id: makeVehicleId(),
        vin: 'MANUAL-ENTRY',
        year: parseInt(manual.year) || 0,
        make: toTitleCase(manual.make),
        model: toTitleCase(manual.model),
        trim: manual.trim ? toTitleCase(manual.trim) : 'N/A',
        color: manual.color ? toTitleCase(manual.color) : 'N/A',
        status: store.statusConfigs.find((c) => c.isDefault)?.slug ?? 'in-yard',
        location: 'Yard A · Row 4',
        intakeDate: new Date().toISOString().split('T')[0],
        estimatedValue: 0,
        mileage: parseInt(manual.mileage) || 0,
        engine: manual.engine ? toTitleCase(manual.engine) : 'N/A',
        transmission: manual.transmission ? toTitleCase(manual.transmission) : 'N/A',
        bodyStyle: 'N/A',
        driveType: 'N/A',
        fuelType: 'N/A',
        plant: 'N/A',
        condition: 'Good',
        partsTotal: 0,
        partsPulled: 0,
        dataSource: 'manual',
      };
      await store.addVehicle(newVehicle);
      setManualSaved(true);
    } catch {
      setSaving(false);
    }
  };

  const sortedParts = [...savedParts].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);
  const showSuccessView = decodeStatus === 'success' && decoded && savedVehicle && configSaved;
  const showManualSuccess = mode === 'manual-entry' && manualSaved && savedVehicle && savedVehicle.vin === 'MANUAL-ENTRY';
  const showConfigStep = configStep && savedVehicle && !configSaved;

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Vehicle Intake</h1>
        <p className="text-slate-400 text-sm mt-0.5">Scan VIN, decode, or enter manually</p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-800/60 rounded-2xl border border-slate-700/50">
        <button
          onClick={() => { setMode('scan'); setDecodeStatus('idle'); setDecoded(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            mode === 'scan' ? 'bg-red-600 text-white' : 'text-slate-400'
          }`}
        >
          <ScanLine size={16} /> Scan
        </button>
        <button
          onClick={() => { setMode('manual-vin'); setDecodeStatus('idle'); setDecoded(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            mode === 'manual-vin' ? 'bg-red-600 text-white' : 'text-slate-400'
          }`}
        >
          <Keyboard size={16} /> VIN
        </button>
        <button
          onClick={() => { setMode('manual-entry'); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            mode === 'manual-entry' ? 'bg-red-600 text-white' : 'text-slate-400'
          }`}
        >
          <ClipboardList size={16} /> Manual
        </button>
      </div>

      {mode === 'scan' && (
        <VinScanner onScan={handleDecode} onManualEntry={() => { setMode('manual-entry'); setDecodeStatus('idle'); }} />
      )}

      {mode === 'manual-vin' && (
        <Card className="p-4 space-y-3">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">VIN Number</label>
          <input
            value={vin}
            onChange={(e) => { setVin(e.target.value.toUpperCase()); setDecodeStatus('idle'); setDecoded(null); }}
            placeholder="Enter 17-character VIN"
            maxLength={17}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white text-base font-mono tracking-wider placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
          />
          <Button
            onClick={() => handleDecode()}
            size="lg"
            className="w-full"
            icon={<Sparkles size={20} />}
            disabled={vin.length < 17 || decodeStatus === 'loading'}
          >
            {decodeStatus === 'loading' ? 'Decoding...' : 'Decode VIN'}
          </Button>
          <p className="text-xs text-slate-600 text-center">17 characters (A-Z, 0-9, no I/O/Q) — powered by NHTSA</p>
        </Card>
      )}

      {mode === 'manual-entry' && !showManualSuccess && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2 p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
            <Info size={14} className="text-cyan-400 flex-shrink-0" />
            <p className="text-xs text-cyan-300">Enter vehicle details manually if VIN decoding is unavailable.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ManualInput label="Year" value={manual.year} onChange={(v) => setManual({ ...manual, year: v })} placeholder="2015" />
            <ManualInput label="Make" value={manual.make} onChange={(v) => setManual({ ...manual, make: v })} placeholder="Toyota" />
            <ManualInput label="Model" value={manual.model} onChange={(v) => setManual({ ...manual, model: v })} placeholder="Tacoma" />
            <ManualInput label="Trim" value={manual.trim} onChange={(v) => setManual({ ...manual, trim: v })} placeholder="TRD" />
            <ManualInput label="Engine" value={manual.engine} onChange={(v) => setManual({ ...manual, engine: v })} placeholder="3.5L V6" />
            <ManualInput label="Transmission" value={manual.transmission} onChange={(v) => setManual({ ...manual, transmission: v })} placeholder="Auto" />
            <ManualInput label="Color" value={manual.color} onChange={(v) => setManual({ ...manual, color: v })} placeholder="Silver" />
            <ManualInput label="Mileage" value={manual.mileage} onChange={(v) => setManual({ ...manual, mileage: v })} placeholder="96000" />
          </div>
          <Button
            onClick={handleManualSubmit}
            size="lg"
            className="w-full"
            icon={saving ? <Loader2 size={20} className="animate-spin" /> : <ClipboardList size={20} />}
            disabled={saving || !manual.year || !manual.make || !manual.model}
          >
            {saving ? 'Saving...' : 'Save Vehicle'}
          </Button>
        </Card>
      )}

      {decodeStatus === 'loading' && (
        <Card className="p-6 flex flex-col items-center text-center">
          <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm mt-4">Querying NHTSA VIN database...</p>
          <p className="text-slate-600 text-xs mt-1">Decoding {vin}</p>
        </Card>
      )}

      {decodeStatus === 'error' && (
        <Card className="p-5 flex flex-col items-center text-center border-red-500/20">
          <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <p className="text-white font-bold text-sm mt-3">Unable to decode this VIN</p>
          <p className="text-slate-400 text-xs mt-1">Please verify or enter manually</p>
          {errorMessage && (
            <p className="text-slate-600 text-xs mt-2 max-w-xs">{errorMessage}</p>
          )}
          <div className="flex gap-2 mt-4">
            <Button
              variant="secondary"
              size="sm"
              icon={<Keyboard size={16} />}
              onClick={() => { setDecodeStatus('idle'); setDecoded(null); }}
            >
              Try Again
            </Button>
            <Button
              size="sm"
              icon={<ClipboardList size={16} />}
              onClick={() => { setMode('manual-entry'); setDecodeStatus('idle'); }}
            >
              Manual Entry
            </Button>
          </div>
        </Card>
      )}

      {showConfigStep && savedVehicle && (
        <FactoryConfigStep
          vehicle={savedVehicle}
          configLoading={configLoading}
          configOptions={configOptions}
          factoryConfig={factoryConfig}
          setFactoryConfig={setFactoryConfig}
          onSave={async () => {
            await store.updateVehicle(savedVehicle.id, {
              exteriorColor: factoryConfig.exteriorColor,
              interiorColor: factoryConfig.interiorColor,
              cabConfig: factoryConfig.cabConfig,
              bedLength: factoryConfig.bedLength,
              infotainmentSystem: factoryConfig.infotainmentSystem,
              lightingOptions: factoryConfig.lightingOptions,
              seatConfig: factoryConfig.seatConfig,
              rpoCodes: factoryConfig.rpoCodes,
              factoryOptions: factoryConfig.factoryOptions,
              configVerified: true,
            });
            setConfigSaved(true);
          }}
          onSkip={() => { setConfigSaved(true); }}
        />
      )}

      {showSuccessView && savedVehicle && savedRevenue && (
        <div className="space-y-4 animate-slide-up">
          <DecodedVehicleDisplay vehicle={savedVehicle} isManual={savedVehicle.vin === 'MANUAL-ENTRY'} statusConfigs={store.statusConfigs} />
          <RevenueCard revenue={savedRevenue} onExplain={() => setExplainer({ breakdown: savedRevenue.breakdown, title: 'Vehicle Revenue Estimate' })} />
          {sortedParts.length > 0 && (
            <DismantlePlanPreview
              parts={sortedParts}
              totalCount={savedParts.length}
              expandedPart={expandedPart}
              setExpandedPart={setExpandedPart}
              onNavigate={onNavigate}
              onExplain={(breakdown, title) => setExplainer({ breakdown, title })}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" icon={<Camera size={20} />}>Photos</Button>
            <Button
              onClick={() => { store.changeVehicleStatus(savedVehicle.id, 'dismantling', 'Begin dismantling').then(() => onNavigate('dismantling')); }}
              size="lg"
              icon={<Wrench size={20} />}
            >
              Begin Dismantling
            </Button>
          </div>
        </div>
      )}

      {showManualSuccess && savedVehicle && (
        <div className="space-y-4 animate-slide-up">
          <DecodedVehicleDisplay vehicle={savedVehicle} isManual statusConfigs={store.statusConfigs} />
          {savedRevenue && <RevenueCard revenue={savedRevenue} onExplain={() => setExplainer({ breakdown: savedRevenue.breakdown, title: 'Vehicle Revenue Estimate' })} />}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" icon={<Camera size={20} />}>Photos</Button>
            <Button
              onClick={() => { store.changeVehicleStatus(savedVehicle.id, 'dismantling', 'Begin dismantling').then(() => onNavigate('dismantling')); }}
              size="lg"
              icon={<Wrench size={20} />}
            >
              Begin Dismantling
            </Button>
          </div>
        </div>
      )}

      {explainer && (
        <EstimateExplainer
          breakdown={explainer.breakdown}
          title={explainer.title}
          onClose={() => setExplainer(null)}
        />
      )}
    </div>
  );
}

function VinScanner({ onScan, onManualEntry }: { onScan: (vin: string) => void; onManualEntry: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'error' | 'unsupported'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [manualVin, setManualVin] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const detectorRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<boolean>(false);
  const lastScannedRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    scanLoopRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }, []);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraState('starting');
    setCameraError('');

    const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    if (!hasBarcodeDetector && !navigator.mediaDevices) {
      setCameraState('unsupported');
      setCameraError('Your browser does not support camera scanning. Use manual VIN entry instead.');
      setShowManualInput(true);
      return;
    }

    if (!navigator.mediaDevices) {
      setCameraState('unsupported');
      setCameraError('Camera access is not available. Use manual VIN entry instead.');
      setShowManualInput(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState('active');

      if (hasBarcodeDetector) {
        const Detector = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: () => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const detector = new Detector({ formats: ['code_39', 'code_128', 'ean_13', 'code_39_vin'] });
        detectorRef.current = detector;
        scanLoopRef.current = true;

        const scanLoop = async () => {
          if (!scanLoopRef.current || !videoRef.current) return;
          try {
            const barcodes = await detector.detect();
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue.trim().toUpperCase();
              if (raw.length >= 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(raw)) {
                const now = Date.now();
                if (raw !== lastScannedRef.current || now - lastScanTimeRef.current > 3000) {
                  lastScannedRef.current = raw;
                  lastScanTimeRef.current = now;
                  stopCamera();
                  onScan(raw);
                  return;
                }
              }
            }
          } catch {
            // detection errors are expected occasionally
          }
          if (scanLoopRef.current) {
            requestAnimationFrame(scanLoop);
          }
        };
        scanLoop();
      }
    } catch {
      setCameraState('error');
      setCameraError('Could not access camera. Check permissions or use manual entry.');
      setShowManualInput(true);
    }
  }, [onScan, stopCamera]);

  const handleManualVinSubmit = () => {
    const v = manualVin.trim().toUpperCase();
    if (v.length >= 17) {
      stopCamera();
      onScan(v);
    }
  };

  const isSupported = cameraState !== 'unsupported';

  return (
    <Card className="p-6 flex flex-col items-center text-center space-y-4">
      {cameraState === 'active' && isSupported && (
        <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-black border-2 border-red-500/40">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <div className="absolute inset-x-4 h-0.5 bg-red-500 animate-pulse" style={{ top: '50%' }} />
          <div className="absolute inset-0 border-4 border-red-500/20 rounded-2xl pointer-events-none" />
          <button
            onClick={stopCamera}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center active:scale-90 transition-transform"
          >
            <CameraOff size={18} className="text-white" />
          </button>
        </div>
      )}

      {cameraState === 'starting' && (
        <div className="w-full h-56 rounded-2xl bg-slate-900/80 border-2 border-dashed border-red-500/40 flex flex-col items-center justify-center">
          <Loader2 size={32} className="text-red-400 animate-spin" />
          <p className="text-slate-400 text-sm mt-3">Starting camera...</p>
        </div>
      )}

      {(cameraState === 'idle' || cameraState === 'error' || cameraState === 'unsupported') && (
        <div className="w-full h-48 rounded-2xl bg-slate-900/80 border-2 border-dashed border-red-500/40 flex flex-col items-center justify-center">
          <ScanLine size={48} className="text-red-500/60" strokeWidth={1.5} />
          <p className="text-slate-400 text-sm mt-4 max-w-xs">
            {cameraState === 'unsupported'
              ? 'Camera scanning not supported on this device'
              : cameraState === 'error'
              ? 'Camera unavailable. Try again or enter VIN manually.'
              : 'Tap below to open your camera and scan the VIN'}
          </p>
        </div>
      )}

      {cameraState === 'idle' && (
        <Button
          onClick={startCamera}
          size="lg"
          className="w-full"
          icon={<ScanLine size={20} />}
        >
          Open Camera Scanner
        </Button>
      )}

      {cameraState === 'error' && (
        <div className="w-full space-y-2">
          <Button
            onClick={startCamera}
            variant="secondary"
            size="lg"
            className="w-full"
            icon={<ScanLine size={20} />}
          >
            Retry Camera
          </Button>
        </div>
      )}

      {cameraState === 'unsupported' && cameraError && (
        <p className="text-xs text-amber-400/80">{cameraError}</p>
      )}

      {showManualInput && (
        <div className="w-full space-y-2 pt-2 border-t border-slate-700/40">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-left">Manual VIN Entry</p>
          <div className="flex gap-2">
            <input
              value={manualVin}
              onChange={(e) => setManualVin(e.target.value.toUpperCase())}
              placeholder="17-character VIN"
              maxLength={17}
              className="flex-1 bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-sm font-mono tracking-wider placeholder:text-slate-600 focus:border-red-500 focus:outline-none text-center"
            />
            <Button
              onClick={handleManualVinSubmit}
              disabled={manualVin.length < 17}
              size="lg"
            >
              Decode
            </Button>
          </div>
        </div>
      )}

      {!showManualInput && cameraState !== 'active' && (
        <button
          onClick={() => { setShowManualInput(true); onManualEntry(); }}
          className="text-red-400 text-sm font-semibold"
        >
          Enter VIN manually instead
        </button>
      )}

      {cameraState === 'active' && (
        <p className="text-slate-400 text-sm">Point camera at the VIN barcode or windshield plate</p>
      )}
    </Card>
  );
}

function DecodedVehicleDisplay({ vehicle, isManual, statusConfigs }: { vehicle: Vehicle; isManual: boolean; statusConfigs: VehicleStatusConfig[] }) {
  const specs = [
    { icon: Gauge, label: 'Mileage', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : 'Not provided' },
    { icon: Fuel, label: 'Engine', value: vehicle.engine },
    { icon: Cog, label: 'Transmission', value: vehicle.transmission },
    { icon: CarFront, label: 'Body Style', value: vehicle.bodyStyle },
    { icon: CircuitBoard, label: 'Drive Type', value: vehicle.driveType },
    { icon: Gauge, label: 'Fuel Type', value: vehicle.fuelType },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="h-32 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative">
        <Car size={56} className="text-slate-500" strokeWidth={1} />
        {!isManual && (
          <div className="absolute top-3 right-3">
            <Badge color="green"><Sparkles size={12} /> Decoded</Badge>
          </div>
        )}
        {isManual && (
          <div className="absolute top-3 right-3">
            <Badge color="cyan"><ClipboardList size={12} /> Manual Entry</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
            <p className="text-sm text-slate-400 mt-0.5">{vehicle.trim}</p>
          </div>
          <StatusBadge status={vehicle.status} configs={statusConfigs} />
        </div>
        {!isManual && vehicle.vin !== 'MANUAL-ENTRY' && (
          <p className="text-xs text-slate-500 font-mono mt-2">VIN: {vehicle.vin}</p>
        )}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {specs.map((d) => {
            const Icon = d.icon;
            return (
              <div key={d.label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{d.label}</p>
                  <p className="text-sm text-white font-medium truncate">{d.value}</p>
                </div>
              </div>
            );
          })}
        </div>
        {!isManual && vehicle.plant !== 'N/A' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/40">
            <Factory size={14} className="text-slate-500" />
            <span className="text-xs text-slate-500">Assembly Plant: {vehicle.plant}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function ManualInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
      />
    </div>
  );
}

function RevenueCard({ revenue, onExplain }: { revenue: RevenueEstimate; onExplain: () => void }) {
  return (
    <Card className="p-4 bg-gradient-to-br from-red-600/10 to-cyan-500/5 border-red-500/20">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-red-400" />
        <p className="text-xs text-red-400 font-semibold uppercase tracking-wide">Vehicle Revenue Estimate</p>
        <Badge color="green">{revenue.confidence}% confidence</Badge>
        {revenue.isEstimated && <span className="text-[10px] text-amber-400/80 font-medium ml-1">All values estimated</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RevStat icon={DollarSign} label="Parts Value (est.)" value={formatCurrency(revenue.projectedPartsValue)} color="text-emerald-400" />
        <RevStat icon={Boxes} label="Scrap Value (est.)" value={formatCurrency(revenue.scrapValue)} color="text-slate-300" />
        <RevStat icon={Clock} label="Labor Hours (est.)" value={`${revenue.laborHours} hrs`} color="text-amber-400" />
        <RevStat icon={TrendingUp} label="Net Profit (est.)" value={formatCurrency(revenue.netProfitEstimate)} color="text-red-400" />
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/40">
        <SourceTag kind="placeholder" />
        <WhyEstimateButton onClick={onExplain} />
      </div>
    </Card>
  );
}

function RevStat({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color: string }) {
  return (
    <div className="p-2.5 bg-slate-900/40 rounded-xl">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-slate-500" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{label}</p>
      </div>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DismantlePlanPreview({
  parts, totalCount, expandedPart, setExpandedPart, onNavigate, onExplain,
}: {
  parts: DismantlePart[];
  totalCount: number;
  expandedPart: string | null;
  setExpandedPart: (id: string | null) => void;
  onNavigate: (s: Screen) => void;
  onExplain: (breakdown: EstimateBreakdown, title: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Brain size={18} className="text-red-400" />
        <h2 className="text-lg font-bold text-white">AI Dismantle Plan</h2>
        <Badge color="blue">{totalCount} parts</Badge>
      </div>
      <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
        <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
        <p className="text-xs text-red-300">Quick-removal high-value parts prioritized. Engine/drivetrain deferred unless pre-sold.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {parts.map((part) => (
          <PlanPartCard
            key={part.id}
            part={part}
            expanded={expandedPart === part.id}
            onClick={() => setExpandedPart(expandedPart === part.id ? null : part.id)}
            onExplain={() => onExplain(part.breakdown, part.name)}
          />
        ))}
      </div>
      <button
        onClick={() => onNavigate('dismantling')}
        className="w-full text-center text-sm text-red-400 font-semibold py-3 mt-2"
      >
        View full plan ({totalCount} parts) →
      </button>
    </div>
  );
}

function PlanPartCard({ part, expanded, onClick, onExplain }: { part: DismantlePart; expanded: boolean; onClick: () => void; onExplain: () => void }) {
  const scoreColor = part.priorityScore >= 85 ? 'text-red-400 bg-red-500/15'
    : part.priorityScore >= 70 ? 'text-amber-400 bg-amber-500/15'
    : part.priorityScore >= 50 ? 'text-cyan-400 bg-cyan-500/15'
    : 'text-slate-400 bg-slate-600/20';

  return (
    <Card onClick={onClick} className="p-3.5">
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${scoreColor}`}>
          <span className="text-base font-bold leading-none">{part.priorityScore}</span>
          <span className="text-[8px] uppercase font-semibold tracking-wide mt-0.5">score</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-white truncate">{part.name}</p>
            {part.demand === 'Hot' && <Flame size={12} className="text-red-400 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <Badge color={demandColor(part.demand)}>{part.demand}</Badge>
            <span className="text-emerald-400 font-semibold">{formatCurrency(part.recommendedPrice)} (est.)</span>
            <span className="text-slate-500">{part.removalTime}min</span>
            <span className="text-slate-500">Stock: {part.stockQty}</span>
          </div>
        </div>
        <ChevronRight size={20} className={`text-slate-600 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <DetailRow label="Market Value (est.)" value={formatCurrency(part.marketValue)} />
            <DetailRow label="List Price (est.)" value={formatCurrency(part.recommendedPrice)} />
            <DetailRow label="Removal Time" value={`${part.removalTime} min`} />
            <DetailRow label="Current Stock" value={`${part.stockQty} units`} />
            <DetailRow label="Profit Estimate" value={formatCurrency(part.profitEstimate)} />
            <DetailRow label="Confidence" value={`${part.confidence}%`} />
            <DetailRow label="Storage Tote" value={part.toteId} />
            <DetailRow label="Condition" value={part.condition} />
            <DetailRow label="Pre-sold Buyer" value={part.hasBuyer ? 'Yes' : 'No'} />
          </div>
          <div className="p-2.5 bg-red-500/10 rounded-xl flex items-start gap-2">
            <Brain size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200">{part.reason}</p>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <SourceTag kind="placeholder" compact />
            <WhyEstimateButton onClick={onExplain} />
          </div>
        </div>
      )}
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function ConfigSelect({
  label, value, onChange, options, placeholder, icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  icon: typeof Palette;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5 flex items-center gap-1">
        <Icon size={12} /> {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        <option value="Unknown">Unknown</option>
      </select>
    </div>
  );
}

function FactoryConfigStep({
  vehicle, configLoading, configOptions, factoryConfig, setFactoryConfig, onSave, onSkip,
}: {
  vehicle: Vehicle;
  configLoading: boolean;
  configOptions: VehicleConfigOptions | null;
  factoryConfig: {
    exteriorColor: string; interiorColor: string; cabConfig: string; bedLength: string;
    infotainmentSystem: string; lightingOptions: string; seatConfig: string;
    rpoCodes: string; factoryOptions: string;
  };
  setFactoryConfig: (c: typeof factoryConfig) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const isTruck = /truck|pickup/i.test(vehicle.bodyStyle);
  const opts = configOptions;

  return (
    <div className="space-y-4 animate-slide-up">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 size={18} className="text-red-400" />
          <h2 className="text-lg font-bold text-white">Factory Configuration</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          These details affect part identification, OEM part numbers, and accurate pricing.
          Select the correct options for this {vehicle.year} {vehicle.make} {vehicle.model}.
        </p>

        {configLoading && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-xl mb-3">
            <Loader2 size={16} className="text-red-400 animate-spin" />
            <p className="text-xs text-red-300">Researching factory options for this vehicle...</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <ConfigSelect
            label="Exterior Color"
            value={factoryConfig.exteriorColor}
            onChange={(v) => setFactoryConfig({ ...factoryConfig, exteriorColor: v })}
            options={opts?.exteriorColors ?? ['Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Brown', 'Beige']}
            placeholder="Select color"
            icon={Palette}
          />
          <ConfigSelect
            label="Interior Color"
            value={factoryConfig.interiorColor}
            onChange={(v) => setFactoryConfig({ ...factoryConfig, interiorColor: v })}
            options={opts?.interiorColors ?? ['Black', 'Gray', 'Beige/Tan', 'Brown', 'White']}
            placeholder="Select color"
            icon={Palette}
          />
          {isTruck && (
            <>
              <ConfigSelect
                label="Cab Configuration"
                value={factoryConfig.cabConfig}
                onChange={(v) => setFactoryConfig({ ...factoryConfig, cabConfig: v })}
                options={opts?.cabConfigs ?? ['Regular Cab', 'Extended Cab', 'Crew Cab', 'Double Cab']}
                placeholder="Select cab"
                icon={CarFront}
              />
              <ConfigSelect
                label="Bed Length"
                value={factoryConfig.bedLength}
                onChange={(v) => setFactoryConfig({ ...factoryConfig, bedLength: v })}
                options={opts?.bedLengths ?? ['Short Bed (5.5-6 ft)', 'Standard Bed (6.5 ft)', 'Long Bed (8 ft)']}
                placeholder="Select bed"
                icon={CarFront}
              />
            </>
          )}
          {vehicle.year >= 2014 && (
            <ConfigSelect
              label="Infotainment System"
              value={factoryConfig.infotainmentSystem}
              onChange={(v) => setFactoryConfig({ ...factoryConfig, infotainmentSystem: v })}
              options={opts?.infotainmentSystems ?? ['Base Radio (No Navigation)', 'Infotainment with Navigation', 'Premium Audio System']}
              placeholder="Select system"
              icon={CircuitBoard}
            />
          )}
          <ConfigSelect
            label="Lighting Options"
            value={factoryConfig.lightingOptions}
            onChange={(v) => setFactoryConfig({ ...factoryConfig, lightingOptions: v })}
            options={opts?.lightingOptions ?? ['Halogen Headlights', 'HID/Xenon Headlights', 'LED Headlights']}
            placeholder="Select lighting"
            icon={Sparkles}
          />
          <ConfigSelect
            label="Seat Configuration"
            value={factoryConfig.seatConfig}
            onChange={(v) => setFactoryConfig({ ...factoryConfig, seatConfig: v })}
            options={opts?.seatConfigs ?? ['Cloth Seats', 'Leather Seats', 'Heated Seats', 'Ventilated Seats']}
            placeholder="Select seats"
            icon={Car}
          />
        </div>

        <div className="mt-3">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
            RPO / Option Codes (optional)
          </label>
          <input
            value={factoryConfig.rpoCodes}
            onChange={(e) => setFactoryConfig({ ...factoryConfig, rpoCodes: e.target.value })}
            placeholder="e.g. IO6, Z71, GT4..."
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm font-mono placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
          />
          <p className="text-[10px] text-slate-600 mt-1">Found on the service parts label in the glove box</p>
        </div>

        <div className="mt-3">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
            Other Factory Options (optional)
          </label>
          <input
            value={factoryConfig.factoryOptions}
            onChange={(e) => setFactoryConfig({ ...factoryConfig, factoryOptions: e.target.value })}
            placeholder="e.g. towing package, sunroof, off-road package..."
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
          />
        </div>

        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mt-4">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Accurate factory configuration is critical for correct OEM part number identification.
            Parts like headlights, infotainment systems, and interior trim vary by these options.
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            onClick={onSave}
            size="lg"
            className="flex-1"
            icon={<CheckCircle2 size={20} />}
          >
            Save Configuration
          </Button>
          <Button
            onClick={onSkip}
            variant="secondary"
            size="lg"
          >
            Skip
          </Button>
        </div>
      </Card>
    </div>
  );
}
