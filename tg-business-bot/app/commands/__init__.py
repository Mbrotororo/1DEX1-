"""Команды бота. Вызови load_all() один раз при старте, чтобы зарегистрировать все модули."""

from .base import ALIASES, CATEGORIES, REGISTRY, Command, Ctx, all_names, catalog, categories, norm, resolve

_MODULES = ("moderation", "love", "animations", "spam", "text", "games", "fun", "utility")


def load_all() -> None:
    import importlib

    for name in _MODULES:
        importlib.import_module(f"{__name__}.{name}")


__all__ = ["ALIASES", "CATEGORIES", "REGISTRY", "Command", "Ctx", "all_names", "catalog",
           "categories", "load_all", "norm", "resolve"]
