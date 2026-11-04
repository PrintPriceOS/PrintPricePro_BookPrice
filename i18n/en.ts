// i18n/en.ts
const en = {
  app_name: "PDF Book Price Calculator",
  upload_pdf_instructions: "Drag & drop your PDF here, or click to select",
  processing_pdf: "Processing PDF...",
  pdf_load_error_message: "Failed to load PDF. Please ensure it's a valid PDF file.",
  api_error_message: "Failed to fetch price offers. Please try again later.",
  select_pdf_first: "Please select a PDF file first.",
  enter_pages_or_upload_pdf: "Enter page counts manually or upload a PDF to get started.",
  enter_specs_or_upload_pdf: "Enter printing specifications manually or upload a PDF to calculate prices.",
  error_label: "Error",
  close_button: "Close",

  // Book Price Form
  book_price_calculator_title: "Book Printing Calculator",
  section_general: "Basic Specifications",
  section_interior: "Interior Specifications",
  section_cover: "Cover Specifications",
  section_binding: "Binding & Finishing",
  copies_label: "Copies",
  copies_help: "Total number of books you want to print.",
  total_page_count_label: "Total Pages (from PDF or Manual)",
  interior_pages_label: "Interior Pages",
  interior_pages_help: "Number of internal pages (excluding the cover).",
  cover_pages_label: "Cover Pages",
  cover_pages_help: "Number of cover pages (usually 4 for paperbacks).",
  book_size_label: "Book Size",
  book_size_help: "Final dimensions of the book when closed.",
  orientation_label: "Orientation",
  orientation_help: "Physical format of the book (Portrait or Landscape).",
  interior_print_label: "Interior Print",
  interior_print_help: "Specify if the interior is black & white or full color.",
  paper_weight_interior_label: "Interior Paper Weight (gsm)",
  paper_weight_interior_help: "Thickness of the internal sheets (e.g., 80gsm or 115gsm).",
  paper_type_interior_label: "Interior Paper Type",
  paper_type_interior_help: "Choose the paper stock for the inside of your book.",
  pms_interior_label: "PMS in Interior",
  pms_interior_help: "Number of special spot colors (Pantone) in interior.",
  cover_print_label: "Cover Print",
  cover_print_help: "Specify if the cover is printed on one or both sides.",
  paper_weight_cover_label: "Cover Paper Weight (gsm)",
  paper_weight_cover_help: "Thickness of the cover material.",
  paper_type_cover_label: "Cover Paper Type",
  paper_type_cover_help: "Choose the paper stock for the book cover.",
  pms_cover_label: "PMS on Cover",
  pms_cover_help: "Number of special spot colors (Pantone) on cover.",
  cover_print_rev_label: "Cover Print Reverse",
  cover_print_rev_help: "Colors for the inside of the cover.",
  binding_method_label: "Binding Method",
  binding_method_help: "The way pages are held together (Sewn, Glue, Hardcover).",
  finishing_options_label: "Finishing Options",
  finishing_options_help: "Protective coating or lamination (Matte, Gloss, SoftTouch).",
  uv_varnish_label: "Extra UV Varnish",
  uv_varnish_help: "Selective glossy layer to highlight specific areas.",
  delivery_country_label: "Delivery Country",
  delivery_country_help: "Final destination for shipping your order.",
  calculate_price_button: "Calculate Price",
  recalculate_offers_button: "Recalculate Offers",
  calculating_offers: "Calculating offers...",
  endpapers_label: "Endpapers",
  endpapers_help: "Decorative sheets connecting cover to book block.",
  endpapers_print_label: "Endpapers Print",
  endpapers_print_help: "Specify printing colors for the endpapers.",
  paper_type_endpaper_label: "Endpapers Paper Type",
  paper_type_endpaper_help: "Choose the paper stock for the endpapers.",
  paper_weight_endpapers_label: "Endpapers Paper Weight (gsm)",
  paper_weight_endpapers_help: "Thickness of the endpaper material.",
  endpapers_mode_info: "Endpaper options for Hardcover binding.",

  // Extra costs
  extra_options_title: "Custom Adjustments",
  extra_book_label: "Per Book",
  extra_book_help: "Additional cost added to every individual book unit.",
  extra_section_label: "Per Section",
  extra_section_help: "Cost per print section (usually 16 or 32 pages).",
  extra_fixed_label: "Fixed Fee",
  extra_fixed_help: "One-time setup or flat cost independent of quantity.",
  extra_variable_label: "Variable Fee",
  extra_variable_help: "Adjustment for variable processing components.",

  // Print Offers Panel
  print_offers_title: "Print Offers",
  no_offers_available: "No offers available. Please adjust specifications and calculate.",
  best_offer_label: "Best Offer",
  estimated_delivery: "Estimated Delivery",
  breakdown_cost: "Breakdown Cost",
  choose_this_offer: "Choose This Offer",
  printing_cost: "Printing",
  paper_cost: "Paper",
  binding_cost: "Binding",
  finishing_cost: "Finishing",
  delivery_cost: "Delivery",
  other_cost: "Other",

  // Header
  about_app: "About",
  contact: "Contact",
  
  // New UI Labels
  book_specifications_label: "Book specifications",
  system_error_label: "System Error",
  calculating_node_offers: "Calculating offers...",
  status_waiting_input: "Status: Awaiting Input",

  // Chat
  project_summary_title: "Project Summary",
  recommended_offers: "Recommended Offers",
};

export const t = (key: keyof typeof en, replacements?: { [key: string]: string | number }) => {
  let message = (en as any)[key] || key;

  if (replacements) {
    for (const placeholder in replacements) {
      if (Object.prototype.hasOwnProperty.call(replacements, placeholder)) {
        message = message.replace(new RegExp(`{{${placeholder}}}`, 'g'), String(replacements[placeholder]));
      }
    }
  }
  return message;
};