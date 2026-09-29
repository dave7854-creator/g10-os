import { useState, useMemo } from 'react';
import { Truck, MapPin, Package, Check, X } from 'lucide-react';
import { Card, Badge, Button, formatCurrency } from '@/components/ui';
import { vehicleLabelString } from '@/data';
import type { Screen, Order, VehicleStore } from '@/types';

export function OrdersScreen({ onNavigate, store }: { onNavigate: (s: Screen) => void; store: VehicleStore }) {
  const [selected, setSelected] = useState<Order | null>(null);

  const { orders, vehicles, selectedVehicleId } = store;
  const [vehicleFilter, setVehicleFilter] = useState<string | 'all'>(selectedVehicleId ?? 'all');

  const filteredOrders = useMemo(() => {
    if (vehicleFilter === 'all') return orders;
    return orders.filter((o) => o.vehicleId === vehicleFilter);
  }, [orders, vehicleFilter]);

  const toShip = filteredOrders.filter((o) => o.status === 'to-ship');
  const shipped = filteredOrders.filter((o) => o.status === 'shipped');

  const markShipped = async (orderId: string) => {
    await store.markOrderShipped(orderId);
    setSelected(null);
  };

  const ordersWithLabels = filteredOrders.map((o) => {
    const v = vehicles.find((v) => v.id === o.vehicleId);
    return { ...o, vehicleLabel: v ? vehicleLabelString(v) : 'Unknown' };
  });

  const toShipLabeled = ordersWithLabels.filter((o) => o.status === 'to-ship');
  const shippedLabeled = ordersWithLabels.filter((o) => o.status === 'shipped');

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Orders</h1>
        <p className="text-slate-400 text-sm mt-0.5">eBay sales fulfillment</p>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        <button
          onClick={() => setVehicleFilter('all')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
            vehicleFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
          }`}
        >
          All Vehicles
        </button>
        {vehicles.map((v) => (
          <button
            key={v.id}
            onClick={() => setVehicleFilter(v.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              vehicleFilter === v.id ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
            }`}
          >
            {v.year} {v.make} {v.model}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{toShip.length}</p>
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mt-0.5">To Ship</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{shipped.length}</p>
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mt-0.5">Shipped</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">
            {formatCurrency(filteredOrders.reduce((s, o) => s + o.salePrice, 0))}
          </p>
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mt-0.5">Revenue</p>
        </Card>
      </div>

      {toShipLabeled.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Needs Shipping</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {toShipLabeled.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => setSelected(order)} />
            ))}
          </div>
        </div>
      )}

      {shippedLabeled.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Shipped</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shippedLabeled.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => setSelected(order)} />
            ))}
          </div>
        </div>
      )}

      {filteredOrders.length === 0 && (
        <div className="flex flex-col items-center text-center py-16">
          <Truck size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No orders for this vehicle</p>
        </div>
      )}

      {selected && (
        <OrderDetailModal
          order={selected}
          vehicleLabel={vehicles.find((v) => v.id === selected.vehicleId)
            ? vehicleLabelString(vehicles.find((v) => v.id === selected.vehicleId)!)
            : 'Unknown'}
          onClose={() => setSelected(null)}
          onShip={() => markShipped(selected.id)}
        />
      )}
    </div>
  );
}

function OrderCard({ order, onClick }: { order: Order & { vehicleLabel: string }; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 font-mono">{order.orderNumber}</p>
          <p className="text-sm font-bold text-white truncate mt-0.5">{order.partName}</p>
        </div>
        <Badge color={order.status === 'to-ship' ? 'amber' : 'blue'}>
          {order.status === 'to-ship' ? 'To Ship' : 'Shipped'}
        </Badge>
      </div>
      <p className="text-xs text-slate-500 mb-3">{order.vehicleLabel}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-slate-500">
          <MapPin size={12} /> {order.buyerLocation}
        </span>
        <span className="text-emerald-400 font-bold text-sm">{formatCurrency(order.salePrice)}</span>
      </div>
    </Card>
  );
}

function OrderDetailModal({
  order, vehicleLabel, onClose, onShip,
}: {
  order: Order;
  vehicleLabel: string;
  onClose: () => void;
  onShip: () => void;
}) {
  const details = [
    { label: 'Order #', value: order.orderNumber },
    { label: 'Buyer', value: order.buyer },
    { label: 'Part', value: order.partName },
    { label: 'Vehicle', value: vehicleLabel },
    { label: 'Tote ID', value: order.toteId },
    { label: 'Carrier', value: order.carrier },
    { label: 'Tracking', value: order.trackingNumber || '— Not assigned —' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">Order Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${order.status === 'to-ship' ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
              <Truck size={24} className={order.status === 'to-ship' ? 'text-amber-400' : 'text-red-400'} />
            </div>
            <div>
              <Badge color={order.status === 'to-ship' ? 'amber' : 'blue'}>
                {order.status === 'to-ship' ? 'Needs Shipping' : 'Shipped'}
              </Badge>
              <p className="text-xs text-slate-500 mt-1 font-mono">{order.orderNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-[10px] text-emerald-400 uppercase font-semibold tracking-wide">Sale Price</p>
              <p className="text-lg font-bold text-white">{formatCurrency(order.salePrice)}</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-xl">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Shipping</p>
              <p className="text-lg font-bold text-slate-300">{formatCurrency(order.shippingCost)}</p>
            </div>
          </div>

          <div className="space-y-0.5">
            {details.map((d) => (
              <div key={d.label} className="flex items-center justify-between py-2.5 border-b border-slate-800/60">
                <span className="text-sm text-slate-500">{d.label}</span>
                <span className="text-sm text-white font-medium text-right max-w-[60%] truncate">{d.value}</span>
              </div>
            ))}
          </div>

          {order.status === 'to-ship' ? (
            <Button onClick={onShip} size="lg" className="w-full" icon={<Check size={20} />}>
              Mark as Shipped
            </Button>
          ) : (
            <Button variant="secondary" size="lg" className="w-full" icon={<Package size={20} />}>
              Print Packing Slip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
