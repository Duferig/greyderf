import os
import random
import re
import threading
import time
from urllib.parse import urljoin

import customtkinter as ctk
from camoufox.sync_api import Camoufox


ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")


class NovelDownloaderApp(ctk.CTk):
    BOOKTOKI_MODE = "Booktoki"
    BQG_MODE = "BQG104"
    BQG_SITE_BASE = "https://m.bqg104.cc"

    def __init__(self):
        super().__init__()

        self.title("Novel Downloader (TXT Version)")
        self.geometry("980x720")
        self.resizable(False, False)

        self.running = False
        self.thread = None
        self.default_folders = {
            self.BOOKTOKI_MODE: "novels_booktoki_txt",
            self.BQG_MODE: "novels_bqg_txt",
        }

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        self.site_mode = ctk.StringVar(value=self.BOOKTOKI_MODE)

        self.settings_frame = ctk.CTkFrame(self)
        self.settings_frame.grid(row=0, column=0, padx=20, pady=20, sticky="ew")
        self.settings_frame.grid_columnconfigure((0, 1, 2), weight=1)

        self.lbl_mode = ctk.CTkLabel(self.settings_frame, text="Сайт:")
        self.lbl_mode.grid(row=0, column=0, padx=10, pady=(10, 0), sticky="w")
        self.lbl_start = ctk.CTkLabel(self.settings_frame, text="Start ID (Первая глава):")
        self.lbl_start.grid(row=0, column=1, padx=10, pady=(10, 0), sticky="w")
        self.lbl_iter = ctk.CTkLabel(self.settings_frame, text="Макс. кол-во глав:")
        self.lbl_iter.grid(row=0, column=2, padx=10, pady=(10, 0), sticky="w")

        self.option_mode = ctk.CTkOptionMenu(
            self.settings_frame,
            values=[self.BOOKTOKI_MODE, self.BQG_MODE],
            variable=self.site_mode,
            command=self.update_mode_ui,
        )
        self.option_mode.grid(row=1, column=0, padx=10, pady=(0, 10), sticky="ew")

        self.entry_start = ctk.CTkEntry(
            self.settings_frame,
            placeholder_text="Booktoki ID или URL / ID для BQG104",
        )
        self.entry_start.insert(0, "9406974")
        self.entry_start.grid(row=1, column=1, padx=10, pady=(0, 10), sticky="ew")

        self.entry_iter = ctk.CTkEntry(self.settings_frame)
        self.entry_iter.insert(0, "50")
        self.entry_iter.grid(row=1, column=2, padx=10, pady=(0, 10), sticky="ew")

        self.lbl_bqg_start = ctk.CTkLabel(
            self.settings_frame, text="Стартовая глава (только BQG):"
        )
        self.lbl_bqg_start.grid(row=2, column=0, padx=10, pady=(5, 0), sticky="w")
        self.lbl_file_start = ctk.CTkLabel(
            self.settings_frame, text="Начать нумерацию с:"
        )
        self.lbl_file_start.grid(row=2, column=1, padx=10, pady=(5, 0), sticky="w")
        self.lbl_folder = ctk.CTkLabel(self.settings_frame, text="Папка сохранения:")
        self.lbl_folder.grid(row=2, column=2, padx=10, pady=(5, 0), sticky="w")

        self.entry_bqg_start = ctk.CTkEntry(self.settings_frame)
        self.entry_bqg_start.insert(0, "1")
        self.entry_bqg_start.grid(row=3, column=0, padx=10, pady=(0, 10), sticky="ew")

        self.entry_file_start = ctk.CTkEntry(self.settings_frame)
        self.entry_file_start.insert(0, "1")
        self.entry_file_start.grid(row=3, column=1, padx=10, pady=(0, 10), sticky="ew")

        self.entry_folder = ctk.CTkEntry(self.settings_frame)
        self.entry_folder.insert(0, self.default_folders[self.BOOKTOKI_MODE])
        self.entry_folder.grid(row=3, column=2, padx=10, pady=(0, 10), sticky="ew")

        self.check_headless = ctk.CTkCheckBox(
            self.settings_frame, text="Скрыть браузер"
        )
        self.check_headless.grid(row=4, column=0, padx=10, pady=(0, 10), sticky="w")

        self.help_label = ctk.CTkLabel(
            self.settings_frame,
            text="",
            justify="left",
            anchor="w",
            wraplength=560,
        )
        self.help_label.grid(
            row=4, column=1, columnspan=2, padx=10, pady=(0, 10), sticky="w"
        )

        self.btn_start = ctk.CTkButton(
            self.settings_frame,
            text="ЗАПУСТИТЬ",
            command=self.start_thread,
            fg_color="green",
            hover_color="darkgreen",
        )
        self.btn_start.grid(
            row=5, column=0, columnspan=2, padx=10, pady=10, sticky="ew"
        )

        self.btn_stop = ctk.CTkButton(
            self.settings_frame,
            text="СТОП",
            command=self.stop_thread,
            fg_color="darkred",
            hover_color="red",
            state="disabled",
        )
        self.btn_stop.grid(row=5, column=2, padx=10, pady=10, sticky="ew")

        self.textbox_log = ctk.CTkTextbox(
            self, width=900, height=470, font=("Consolas", 12)
        )
        self.textbox_log.grid(row=1, column=0, padx=20, pady=(0, 20), sticky="nsew")
        self.textbox_log.configure(state="disabled")

        self.update_mode_ui()
        self._append_log("Режим: Сохранение в TXT.")
        self._append_log("Доступно два режима: Booktoki и BQG104.")
        self._append_log(
            "BQG104 сохраняет полную главу одним файлом, даже если сайт делит ее на части вроде 2_2."
        )

    def _append_log(self, message):
        self.textbox_log.configure(state="normal")
        self.textbox_log.insert("end", message + "\n")
        self.textbox_log.see("end")
        self.textbox_log.configure(state="disabled")

    def log_message(self, message):
        self.after(0, self._append_log, message)

    def update_mode_ui(self, _value=None):
        mode = self.site_mode.get()

        if mode == self.BOOKTOKI_MODE:
            self.lbl_start.configure(text="Start ID (Первая глава):")
            self.help_label.configure(
                text="Booktoki: вставьте ID первой главы. Парсер пойдет по кнопке следующей главы и сохранит главы в отдельные TXT."
            )
        else:
            self.lbl_start.configure(text="Book ID / URL:")
            self.help_label.configure(
                text="BQG104: можно вставить book id, ссылку на книгу или ссылку на часть главы, например /book/437/2_2.html. Если в ссылке указана часть, парсер все равно скачает полную главу и продолжит дальше."
            )

        if not self.running:
            self._apply_folder_default(mode)
            if mode == self.BOOKTOKI_MODE:
                self.entry_bqg_start.configure(state="disabled")
            else:
                self.entry_bqg_start.configure(state="normal")

    def _apply_folder_default(self, mode):
        current_folder = self.entry_folder.get().strip()
        if not current_folder or current_folder in self.default_folders.values():
            self.entry_folder.delete(0, "end")
            self.entry_folder.insert(0, self.default_folders[mode])

    def set_inputs_state(self, state):
        for widget in (
            self.option_mode,
            self.entry_start,
            self.entry_iter,
            self.entry_bqg_start,
            self.entry_file_start,
            self.entry_folder,
            self.check_headless,
        ):
            widget.configure(state=state)

        if state == "normal":
            self.update_mode_ui()

    def start_thread(self):
        if self.running:
            return

        mode = self.site_mode.get()
        source_value = self.entry_start.get().strip()
        folder = self.entry_folder.get().strip() or self.default_folders[mode]

        if not source_value:
            self.log_message("ОШИБКА: Поле ID / URL не должно быть пустым.")
            return

        try:
            iterations = int(self.entry_iter.get())
            bqg_start_chapter = int(self.entry_bqg_start.get())
            file_start_num = int(self.entry_file_start.get())
            headless = bool(self.check_headless.get())
        except ValueError:
            self.log_message(
                "ОШИБКА: Проверьте, что в числовых полях введены корректные числа."
            )
            return

        if iterations <= 0 or bqg_start_chapter <= 0 or file_start_num <= 0:
            self.log_message("ОШИБКА: Все числовые значения должны быть больше нуля.")
            return

        if mode == self.BOOKTOKI_MODE:
            try:
                int(source_value)
            except ValueError:
                self.log_message(
                    "ОШИБКА: Для Booktoki в поле Start ID нужно указать число."
                )
                return

        self.running = True
        self.btn_start.configure(state="disabled")
        self.btn_stop.configure(state="normal")
        self.set_inputs_state("disabled")

        self.thread = threading.Thread(
            target=self.run_parser_logic,
            args=(
                mode,
                source_value,
                iterations,
                folder,
                headless,
                file_start_num,
                bqg_start_chapter,
            ),
            daemon=True,
        )
        self.thread.start()

    def stop_thread(self):
        self.running = False
        self.log_message("\n!!! ОСТАНОВКА ПОСЛЕ ТЕКУЩЕГО ДЕЙСТВИЯ !!!")
        self.btn_stop.configure(state="disabled")

    def _reset_ui_on_main_thread(self):
        self.running = False
        self.btn_start.configure(state="normal")
        self.btn_stop.configure(state="disabled")
        self.set_inputs_state("normal")
        self._append_log("\n--- Работа завершена ---")

    def reset_ui(self):
        self.after(0, self._reset_ui_on_main_thread)

    def human_pause(self, min_seconds, max_seconds):
        time.sleep(random.uniform(min_seconds, max_seconds))

    def normalize_text(self, text):
        return text.replace("\r\n", "\n").replace("\r", "\n").strip()

    def clean_title(self, title, fallback):
        clean = self.normalize_text(title or "")
        if clean:
            return clean.split("\n")[0].strip()
        return fallback

    def safe_int(self, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def estimate_bqg_page_count(self, text, size=1000):
        text = text or ""
        lines = text.split("\n")
        if not lines:
            return 1

        remaining = len(text)
        current_len = 0
        pages = 0

        for line in lines:
            current_len += len(line)
            remaining -= len(line)
            if current_len > size and remaining > size / 2:
                pages += 1
                current_len = 0

        return max(1, pages + 1)

    def save_chapter_txt(
        self,
        output_folder,
        file_number,
        chapter_title,
        source_url,
        novel_text,
        extra_meta=None,
    ):
        os.makedirs(output_folder, exist_ok=True)
        filename = os.path.join(output_folder, f"{file_number}.txt")

        header_lines = [chapter_title.strip(), f"Source: {source_url}"]
        if extra_meta:
            header_lines.extend(extra_meta)
        header_lines.append("=" * 20)

        with open(filename, "w", encoding="utf-8") as txt_file:
            txt_file.write("\n".join(header_lines))
            txt_file.write("\n\n")
            txt_file.write(self.normalize_text(novel_text))

        return filename

    def open_page_with_retry(self, page, url, wait_selector=None, attempts=2):
        last_error = None

        for attempt in range(1, attempts + 1):
            try:
                page.goto(url, wait_until="domcontentloaded")
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass

                if wait_selector:
                    page.wait_for_selector(wait_selector, state="attached", timeout=20000)

                self.light_humanize_page(page)
                return
            except Exception as error:
                last_error = error
                if attempt < attempts:
                    self.log_message(
                        f"  ! Повторное открытие страницы ({attempt + 1}/{attempts})..."
                    )
                    self.human_pause(1.5, 3.0)

        raise last_error

    def light_humanize_page(self, page):
        self.human_pause(0.5, 1.1)
        try:
            page.evaluate(
                """(scroll_value) => {
                    window.scrollTo(0, scroll_value);
                }""",
                random.randint(140, 900),
            )
            self.human_pause(0.2, 0.5)
            page.evaluate("() => window.scrollTo(0, 0)")
        except Exception:
            pass

    def fetch_json_via_page(self, page, api_path, attempts=2):
        last_error = None
        script = """
            async (path) => {
                const response = await fetch(path, {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} for ${path}`);
                }

                return await response.json();
            }
        """

        for attempt in range(1, attempts + 1):
            try:
                return page.evaluate(script, api_path)
            except Exception as error:
                last_error = error
                if attempt < attempts:
                    self.log_message(
                        f"  ! Ошибка API {api_path}, повтор {attempt + 1}/{attempts}..."
                    )
                    self.human_pause(1.0, 2.2)

        raise last_error

    def parse_bqg_source(self, source_value, fallback_start_chapter):
        source_value = source_value.strip()

        chapter_match = re.search(
            r"/book/(\d+)/(\d+)(?:_(\d+))?\.html",
            source_value,
            flags=re.IGNORECASE,
        )
        if chapter_match:
            book_id = int(chapter_match.group(1))
            chapter_id = int(chapter_match.group(2))
            page_part = int(chapter_match.group(3) or 1)
            return book_id, chapter_id, page_part

        book_match = re.search(
            r"/book/(\d+)/?",
            source_value,
            flags=re.IGNORECASE,
        )
        if book_match:
            return int(book_match.group(1)), fallback_start_chapter, None

        if source_value.isdigit():
            return int(source_value), fallback_start_chapter, None

        raise ValueError(
            "Для BQG104 укажите book id, ссылку на книгу или ссылку на главу."
        )

    def run_parser_logic(
        self,
        mode,
        source_value,
        iterations,
        output_folder,
        is_headless,
        file_start_num,
        bqg_start_chapter,
    ):
        try:
            if mode == self.BOOKTOKI_MODE:
                self.run_booktoki_logic(
                    int(source_value),
                    iterations,
                    output_folder,
                    is_headless,
                    file_start_num,
                )
            else:
                self.run_bqg_logic(
                    source_value,
                    iterations,
                    output_folder,
                    is_headless,
                    file_start_num,
                    bqg_start_chapter,
                )
        except Exception as error:
            self.log_message(f"Критическая ошибка: {error}")
        finally:
            self.reset_ui()

    def run_booktoki_logic(
        self, start_id, iterations, output_folder, is_headless, file_start_num
    ):
        current_url = f"https://booktoki469.com/novel/{start_id}"
        os.makedirs(output_folder, exist_ok=True)

        self.log_message(
            f"Режим {self.BOOKTOKI_MODE}. Запуск Camoufox (Headless: {is_headless})..."
        )

        with Camoufox(headless=is_headless, geoip=True) as browser:
            page = browser.new_page()
            page.set_default_timeout(60000)

            for i in range(iterations):
                if not self.running:
                    self.log_message("Принудительная остановка пользователем.")
                    break

                self.log_message(f"\n[{i + 1}/{iterations}] URL: {current_url}")

                try:
                    self.open_page_with_retry(page, current_url, "#novel_content")

                    content_element = page.locator("#novel_content")
                    if content_element.count() <= 0:
                        self.log_message("  -> Пусто/Ошибка загрузки текста.")
                        break

                    novel_text = self.normalize_text(content_element.inner_text())
                    title_element = page.locator(".toon-title")
                    if title_element.count() > 0:
                        chapter_title = self.clean_title(
                            title_element.first.inner_text(),
                            f"Chapter_{i + 1}",
                        )
                    else:
                        chapter_title = f"Chapter_{i + 1}"

                    file_number = file_start_num + i
                    filename = self.save_chapter_txt(
                        output_folder,
                        file_number,
                        chapter_title,
                        current_url,
                        novel_text,
                    )
                    self.log_message(f"  -> Скачано: {os.path.basename(filename)}")

                    next_btns = page.locator("#goNextBtn")
                    if next_btns.count() <= 0:
                        self.log_message("  -> Кнопка 'Следующая глава' не найдена. Конец.")
                        break

                    next_href = next_btns.first.get_attribute("href")
                    if not next_href or "novel" not in next_href:
                        self.log_message(
                            "  -> Это последняя глава или ссылка не ведет на novel."
                        )
                        break

                    current_url = urljoin(current_url, next_href)

                except Exception as error:
                    self.log_message(f"  -> ОШИБКА: {error}")
                    break

                if i < iterations - 1:
                    sleep_time = random.uniform(4.0, 7.0)
                    self.log_message(f"  -> Пауза {sleep_time:.1f} сек...")
                    time.sleep(sleep_time)

    def run_bqg_logic(
        self,
        source_value,
        iterations,
        output_folder,
        is_headless,
        file_start_num,
        bqg_start_chapter,
    ):
        book_id, start_chapter, page_part = self.parse_bqg_source(
            source_value,
            bqg_start_chapter,
        )

        os.makedirs(output_folder, exist_ok=True)
        start_url = f"{self.BQG_SITE_BASE}/book/{book_id}/{start_chapter}.html"

        self.log_message(
            f"Режим {self.BQG_MODE}. Запуск Camoufox (Headless: {is_headless})..."
        )
        self.log_message(
            "BQG104 будет собирать полную главу через API и сохранять ее одним TXT."
        )
        if page_part and page_part > 1:
            self.log_message(
                f"Ссылка указывала на часть {page_part} главы {start_chapter}. Будет сохранена полная глава {start_chapter}."
            )

        with Camoufox(headless=is_headless, geoip=True) as browser:
            page = browser.new_page()
            page.set_default_timeout(60000)

            self.open_page_with_retry(page, start_url, "#read")

            book_data = self.fetch_json_via_page(page, f"/api/book?id={book_id}")
            book_title = self.clean_title(book_data.get("title"), f"Book_{book_id}")
            total_chapters = self.safe_int(book_data.get("lastchapterid")) or 0

            self.log_message(f"Книга: {book_title}")
            if total_chapters:
                self.log_message(f"Последняя доступная глава на сайте: {total_chapters}")

            current_chapter = start_chapter
            downloaded = 0

            while downloaded < iterations:
                if not self.running:
                    self.log_message("Принудительная остановка пользователем.")
                    break

                if total_chapters and current_chapter > total_chapters:
                    self.log_message("  -> Достигнут конец книги.")
                    break

                chapter_url = f"{self.BQG_SITE_BASE}/book/{book_id}/{current_chapter}.html"
                self.log_message(f"\n[{downloaded + 1}/{iterations}] URL: {chapter_url}")

                try:
                    self.open_page_with_retry(page, chapter_url, "#read")

                    chapter_data = self.fetch_json_via_page(
                        page,
                        f"/api/chapter?id={book_id}&chapterid={current_chapter}",
                    )

                    chapter_title = self.clean_title(
                        chapter_data.get("chaptername"),
                        f"Chapter_{current_chapter}",
                    )
                    novel_text = self.normalize_text(chapter_data.get("txt", ""))

                    if not novel_text:
                        self.log_message("  -> Пустая глава или ошибка загрузки текста.")
                        break

                    total_chapters = self.safe_int(chapter_data.get("cs")) or total_chapters
                    file_number = file_start_num + downloaded
                    page_count = self.estimate_bqg_page_count(novel_text)

                    extra_meta = [
                        f"Book: {book_title}",
                        f"Book ID: {book_id}",
                        f"Chapter ID: {current_chapter}",
                    ]
                    if page_count > 1:
                        extra_meta.append(f"Source Pages: {page_count}")

                    filename = self.save_chapter_txt(
                        output_folder,
                        file_number,
                        chapter_title,
                        chapter_url,
                        novel_text,
                        extra_meta=extra_meta,
                    )

                    if page_count > 1:
                        self.log_message(
                            f"  -> Глава была разбита на {page_count} частей на сайте, сохранена одним файлом."
                        )

                    self.log_message(f"  -> Скачано: {os.path.basename(filename)}")

                    downloaded += 1
                    current_chapter += 1

                except Exception as error:
                    self.log_message(f"  -> ОШИБКА: {error}")
                    break

                if downloaded < iterations:
                    sleep_time = random.uniform(2.5, 4.5)
                    self.log_message(f"  -> Пауза {sleep_time:.1f} сек...")
                    time.sleep(sleep_time)


if __name__ == "__main__":
    app = NovelDownloaderApp()
    app.mainloop()
