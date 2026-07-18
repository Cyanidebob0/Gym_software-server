-- Workout progress photos are personal data. Keep the bucket private; the
-- server returns short-lived signed URLs after verifying session ownership.
update storage.buckets
set public = false
where id = 'workout-photos';
