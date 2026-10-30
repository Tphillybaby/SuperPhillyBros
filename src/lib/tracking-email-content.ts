export function trackingMessage(order: { id: string; tracking_number: string; shipping_carrier: string }) {
  return {
    subject: `Your Super Philly Bros order #${order.id.slice(0,8).toUpperCase()} has shipped`,
    text: `Your Super Philly Bros order is on its way!\n\nOrder: #${order.id.slice(0,8).toUpperCase()}\nCarrier: ${order.shipping_carrier}\nTracking number: ${order.tracking_number}\n\nVisit your carrier's official website and enter the tracking number to follow your shipment. Tracking may take time to update after the carrier receives the package.\n\nThanks for collecting with Super Philly Bros!\nhttps://superphillybros.com`,
  };
}
