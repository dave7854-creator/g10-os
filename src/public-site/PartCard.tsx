import type { EbayItem } from './ebayApi';

interface PartCardProps {
  item: EbayItem;
  onClick: (itemId: string, item?: EbayItem) => void;
}

export function PartCard({ item, onClick }: PartCardProps) {
  return (
    <div className="fp-part-card" onClick={() => onClick(item.itemId, item)}>
      <div className="fp-part-card-img">
        {item.image ? (
          <img src={item.image} alt={item.title} loading="lazy" />
        ) : (
          <span className="fp-part-card-img-placeholder">No image</span>
        )}
      </div>
      <div className="fp-part-card-body">
        <div className="fp-part-card-title">{item.title}</div>
        <div className="fp-part-card-price">
          {item.price ? `$${item.price}` : 'See Details'}
        </div>
        <div className="fp-part-card-condition">{item.condition}</div>
      </div>
    </div>
  );
}
