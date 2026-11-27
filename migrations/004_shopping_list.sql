create table if not exists shopping_items (
  id serial primary key,
  category text not null,
  label text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (category in ('fresh', 'seafood', 'chilled', 'pantry')),
  check (char_length(trim(label)) > 0)
);

create index if not exists shopping_items_category_idx
  on shopping_items (category, sort_order, id);

-- Seed the Fitz kitchen list once (matches staff sheet layout).
insert into shopping_items (category, label, sort_order)
select v.category, v.label, v.sort_order
from (
  values
    ('fresh', 'Paprika', 1),
    ('fresh', 'Mangold', 2),
    ('fresh', 'Tomaten', 3),
    ('fresh', 'Cherry tomaten', 4),
    ('fresh', 'Ingwer', 5),
    ('fresh', 'Salatmischung', 6),
    ('fresh', 'Rucola', 7),
    ('fresh', 'Zitrone', 8),
    ('fresh', 'Limette', 9),
    ('fresh', 'Orange', 10),
    ('fresh', 'Obst für Dessert', 11),
    ('fresh', 'Grüne Äpfel', 12),
    ('fresh', 'Junge Zwiebel', 13),
    ('fresh', 'Avocado', 14),
    ('fresh', 'Beeren', 15),
    ('fresh', 'Basilikum', 16),
    ('fresh', 'Rosmarin', 17),
    ('fresh', 'Minze', 18),
    ('fresh', 'Thymian', 19),
    ('fresh', 'Salbei', 20),
    ('fresh', 'Steinpilze', 21),
    ('fresh', 'Petersilie', 22),
    ('fresh', 'Lauch', 23),
    ('seafood', 'Black tigers', 1),
    ('seafood', 'Jakobsmuscheln', 2),
    ('seafood', 'Octopus', 3),
    ('seafood', 'Tuna', 4),
    ('seafood', 'Calamari', 5),
    ('seafood', 'Cozze', 6),
    ('chilled', 'Mayonnaise', 1),
    ('chilled', 'Qimik', 2),
    ('chilled', 'Crème fraîche', 3),
    ('chilled', 'Eier', 4),
    ('pantry', 'Thunfisch Konserve', 1),
    ('pantry', 'Sardinen', 2),
    ('pantry', 'Kokosbutter', 3),
    ('pantry', 'Gelatine', 4),
    ('pantry', 'Tahini', 5),
    ('pantry', 'Honig / Agave', 6),
    ('pantry', 'Vanilleschote', 7),
    ('pantry', 'Vanillezucker', 8),
    ('pantry', 'Safran', 9),
    ('pantry', 'Mandeln', 10),
    ('pantry', 'Walnüsse', 11),
    ('pantry', 'Cashew', 12),
    ('pantry', 'Trüffelpesto', 13),
    ('pantry', 'Datteln', 14),
    ('pantry', 'Polenta', 15),
    ('pantry', 'Kapern', 16),
    ('pantry', 'Oliven Konserve', 17),
    ('pantry', 'Senf / Tomatenmark', 18),
    ('pantry', 'Kakao', 19)
) as v(category, label, sort_order)
where not exists (select 1 from shopping_items limit 1);
