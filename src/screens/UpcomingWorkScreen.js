import OperationsScreen from './OperationsScreen';

// Upcoming Work: the full list of upcoming appointments, opened from Home -> Upcoming work -> See more.
// It is the bookings part of Customers & work in its own page, so every action (complete, confirm,
// reschedule, remind, cancel), the reminder lines and the booking details behave exactly the same in
// both places. Route params: bookingId (+ openedAt) opens that booking's details.
export default function UpcomingWorkScreen(props) {
  return <OperationsScreen {...props} mode="upcoming" />;
}
