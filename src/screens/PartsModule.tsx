import { useState } from 'react';
import { Package, ScanLine, Car, Wrench, Boxes, Truck, Store, ListChecks } from 'lucide-react';
import { ModuleNav, type NavTab } from '@/components/ModuleNav';
import { IntakeScreen } from '@/screens/IntakeScreen';
import { VehiclesScreen } from '@/screens/VehiclesScreen';
import { DismantlingScreen } from '@/screens/DismantlingScreen';
import { InventoryScreen } from '@/screens/InventoryScreen';
import { OrdersScreen } from '@/screens/OrdersScreen';
import { EbayListingsScreen } from '@/screens/EbayListingsScreen';
import { PrepareForListing } from '@/screens/PrepareForListing';
import { ModuleMessageLink } from '@/messaging/ModuleMessageLink';
import type { Screen, VehicleStore } from '@/types';

type PartsTab = 'intake' | 'vehicles' | 'dismantling' | 'inventory' | 'prepare' | 'ebay' | 'orders';

const tabs: NavTab[] = [
  { id: 'intake', label: 'Scan VIN', icon: ScanLine },
  { id: 'vehicles', label: 'Vehicles', icon: Car },
  { id: 'dismantling', label: 'Dismantle', icon: Wrench },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'prepare', label: 'Prepare', icon: ListChecks },
  { id: 'ebay', label: 'eBay', icon: Store },
  { id: 'orders', label: 'Orders', icon: Truck },
];

export function PartsModule({ store, onExit, onNavigate, isManager }: { store: VehicleStore; onExit: () => void; onNavigate: (s: Screen) => void; isManager: boolean }) {
  const [tab, setTab] = useState<PartsTab>('intake');

  const navigate = (s: Screen) => {
    if (tabs.some((t) => t.id === s)) {
      setTab(s as PartsTab);
    } else if (s === 'home') {
      onExit();
    } else {
      onNavigate(s);
    }
  };

  const renderTab = () => {
    switch (tab) {
      case 'intake': return <div className="space-y-4"><ModuleMessageLink module="parts" onNavigate={navigate} /><IntakeScreen onNavigate={navigate} store={store} /></div>;
      case 'vehicles': return <VehiclesScreen onNavigate={navigate} store={store} />;
      case 'dismantling': return <DismantlingScreen onNavigate={navigate} store={store} />;
      case 'inventory': return <InventoryScreen onNavigate={navigate} store={store} />;
      case 'prepare': return <PrepareForListing onNavigate={navigate} store={store} isManager={isManager} />;
      case 'ebay': return <EbayListingsScreen onNavigate={navigate} store={store} isManager={isManager} />;
      case 'orders': return <OrdersScreen onNavigate={navigate} store={store} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <ModuleNav
        title="Parts Management"
        subtitle="Intake to fulfillment"
        tabs={tabs}
        current={tab}
        onNavigate={(id) => setTab(id as PartsTab)}
        onExit={onExit}
        exitLabel="Back to Home"
      />
      <div className="lg:pl-60">
        <div className="max-w-7xl mx-auto">
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
